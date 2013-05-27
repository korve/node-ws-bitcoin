/**
 * User: https://github.com/korve/
 * Date: 21.05.13
 * Time: 16:43
 */

var fs      = require("fs"),
    socketIo= require("socket.io"),
    bitcoin = require("bitcoin");

/**
 * Get available bitcoin commands
 * @type {Array}
 */
var bitcoinCommands = [];
for(var command in require("bitcoin/lib/commands"))
{
    bitcoinCommands.push(command.toLocaleLowerCase());
}

/**
 * WsBitcoinService constructor
 *
 * @param {Object} options
 * @constructor
 */
function WsBitcoinService(options){

    this.options = {
        wsPort:     18337,
        /**
         * This options object is passed to the socket.io constructor.
         * @see https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
         */
        socketIoOptions: {
        },

        /**
         * Bitcoin Server General Settings
         */
        bitcoinHost: "127.0.0.1",
        bitcoinPort: 8332,
        bitcoinUser: "",
        bitcoinPass: "",

        /**
         * Bitcoin Server SSL Settinggs
         */
        bitcoinUseSSL:      false,
        bitcoinSSLStrict:   false,
        bitcoinSSLCertFile: "",

        /**
         * Testnet Settings
         */
        testnet:     false,
        testnetPort: 18332,

        /**
         * The interval in which the bitcoin api will be checked
         * for new transactions
         */
        checkInterval: 5000,
        bitcoinTransactionConfirmationThreshold: 6
    };

    if(typeof options == "undefined")
    {
        options = {};
    }

    for (var i in options) {
        if (options.hasOwnProperty(i)) {
            this.options[i] = options[i];
        }
    }

    /**
     * Holds all additional action methods
     * @type {Array}
     */
    this.actions = {
        "listavailableactions": this.listAvailableActions,
        "subscribenewtx": this.subscribeToNewTransaction
    };

    this._startAccountWatcher();
};

WsBitcoinService.prototype.start = function(){

    /**
     * start listening for incoming socket connections
     */
    this.io = socketIo.listen(
        this.options.wsPort,
        this.options.socketIoOptions
    );

    this.io.sockets.on('connection', this.onConnection.bind(this));

    var bitcoinClientConfig = {
        host:   this.options.bitcoinHost,
        port:   (this.options.testnet === true ? this.options.testnetPort : this.options.bitcoinPort),
        user:   this.options.bitcoinUser,
        pass:   this.options.bitcoinPass
    };

    if(this.options.bitcoinUseSSL === true)
    {
        if(fs.exists(this.options.bitcoinSSLCertFile))
        {
            bitcoinClientConfig.ssl         = true;
            bitcoinClientConfig.sslStrict   = this.options.bitcoinSSLStrict;
            bitcoinClientConfig.sslCa       = fs.readFileSync(this.options.bitcoinSSLCertFile);
        }
        else
        {
            throw new Error("SSL Cert file \"" + this.options.bitcoinSSLCertFile + "\" not found.");
        }
    }

    this.bitcoinClient = new bitcoin.Client(bitcoinClientConfig);

    /**
     * Contains all transaction ids that have been confirmed
     * @type {Array}
     * @private
     */
    this._confirmedTransactions = [];
};

WsBitcoinService.prototype.stop = function(){
    this.io.server.close();
};

WsBitcoinService.prototype.onConnection = function(socket) {

    var self = this;

    socket.on("disconnect", this.onDisconnect.bind(this));

    socket.on('apiCall', function (data) {
        var action = data.action;
        var args = data.args;

        if(typeof action != "string" || action.length == 0)
        {
            throw new Error("Invalid action parameter for apiCall");
        }

        if(Array.isArray(args) === false)
        {
            args = [];
        }

        console.log("debug: reiceved apiCall: " + JSON.stringify(data));

        args.unshift(action);
        args.push(function(err, data){

            if(err)
            {
                console.log(err);
            }
            else
            {
                socket.emit("apiResponse", {
                    "action":   action,
                    "callArgs": args,
                    "result":   data
                });
            }

        });

        /**
         * First check if a own action exist. If not, call
         * the bitcoin client.
         */
        if(typeof self.actions[action] == "function")
        {
            console.log("debug: calling internal function: " + args[0]);
            self.actions[action].bind(self)(socket, args);
        }
        else
        {
            if(bitcoinCommands.indexOf(action) >= 0)
            {
                console.log("debug: calling bitcoin api: " + args[0]);
                self.bitcoinClient.cmd.apply(self.bitcoinClient, args);
            }
            else
            {
                throw new Error("Action " + action + " not supported.");
            }
        }
    });
};

WsBitcoinService.prototype.onDisconnect = function(reason){

};

/**
 * Lists all available web service actions
 * @param {Socket} Socket.io socket
 * @param {Object} args The args that this action has been called with
 */
WsBitcoinService.prototype.listAvailableActions = function(socket, args){

    var action = args[0];

    var actions = [];

    /**
     * push addditional actions to array
     */
    for(var action in this.actions)
    {
        actions.push(action);
    }

    actions = actions.concat(bitcoinCommands);

    socket.emit("apiResponse", {
        "action":   action,
        "callArgs": args,
        "result":   actions
    });

};

/**
 * Clients can subscribe to receive notifications if new transactions are inbound
 * to a specific account.
 * @param {Socket} socket
 * @param {Object} args  An array containing arguments for this action. First element is always the action name, following
 *              arguments are arguments for this action and the last argument is always the callback function when
 *              this action is finished.
 *              e.g.: <actionName>,[...],<callback>
 */
WsBitcoinService.prototype.subscribeToNewTransaction = function(socket, args){

    //var action = args[0];
    var accountName = args[1]

    if(typeof accountName != "string")
    {
        throw new Error("Invalid argument count");
    }

    /**
     * Join a room specific to this this account to receive
     * notifications when a new transaction occurs
     */
    console.log("debug: client " + socket.id + " join the new transaction subscription: newTx" + accountName);
    socket.join("newTx" + accountName);
    this._broadcastNewTransactions("listen", []);
};

/**
 * Indexes all previous confirmed transactions into the confirmedTransactions list. This
 * function is usually called on startup.
 * @param cb Callback function is called after old transactions have been finished
 * @private
 */
WsBitcoinService.prototype._indexOldTransactions = function(cb)
{
    this._checkNewTransactions();
};

/**
 * Starts the account watcher, which monitors new transactions
 * @private
 */
WsBitcoinService.prototype._startAccountWatcher = function()
{
    this._checkNewTransactionsInterval = setInterval(this._checkNewTransactions.bind(this), this.options.checkInterval);
};

/**
 * Stop the account watcher, which monitors new transactions
 * @private
 */
WsBitcoinService.prototype._stopAccountWatcher = function()
{
    clearInterval(this._checkNewTransactionsInterval);
};

/**
 * The account watcher setInterval callback function. Checks for new transactions periodically
 * @private
 */
WsBitcoinService.prototype._checkNewTransactions = function()
{
    /**
     * To get the latest transaction:
     * 1. Check if the block we are currently working on is the latest.
     *
     */
    var self = this;
    var newTransactions = [];

    self.bitcoinClient.listUnspent(self.options.bitcoinTransactionConfirmationThreshold, function(err, data){
        if(err)
        {
            throw new Error(err);
        }

        var transactions = data;
        var j = 0;

        function checkFinished(count)
        {
            if(count >= transactions.length - 1)
            {
                onFinished();
            }
        }

        for(var i in transactions)
        {
            var tx = transactions[i];

            if(typeof self._confirmedTransactions[tx.txid] != "undefined")
            {
                /**
                 * transaction already in index
                 */
                checkFinished(j++);
                continue;
            }

            self.bitcoinClient.getTransaction(tx.txid, function(err, txDetails){

                if(err)
                {
                    throw new Error(err);
                }
                else
                {
                    var newTxObj = {
                        "tx": tx,
                        "details": txDetails
                    };

                    /**
                     * This transaction is confirmed
                     */
                    self._confirmedTransactions[this.tx.txid] = newTxObj;
                    newTransactions.push(newTxObj);
                }
                checkFinished(j++);
            }.bind({"tx": tx}));
        }
    });

    function onFinished(){
        for(var txId in newTransactions)
        {
            /**
             * listunspent details about the transcation
             */
            var tx = newTransactions[txId];

            /**
             * getTransaction details about the transaction
             */
            var details = tx.details;
            var account = details.account;

            //TODO: Broadcast new transactions for account
        }
    };
};

WsBitcoinService.prototype._broadcastNewTransactions = function(accountName, transactions)
{
    if(typeof accountName != "string" || accountName.length == 0)
    {
        throw new Error("Invalid account");
    }

    if(Array.isArray(transactions) === false)
        transactions = [];

    this.io.sockets.in("newTx" + accountName).emit("newTransactions", {
        "transactions": transactions
    });
};

module.exports.WsBitcoinService = WsBitcoinService;