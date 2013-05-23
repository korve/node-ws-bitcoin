/**
 * User: https://github.com/korve/
 * Date: 21.05.13
 * Time: 16:43
 */

var fs      = require("fs"),
    socketIo= require("socket.io"),
    bitcoin = require("bitcoin");

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
        testnetPort: 18332
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
};

WsBitcoinService.prototype.stop = function(){
    this.io.server.close();
};

WsBitcoinService.prototype.onConnection = function(socket) {

    var self = this;

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
                    "callArgs":     args,
                    "result":   data
                });
            }

        });

        console.log("debug: calling bitcoin api: " + args[0]);
        try
        {
            self.bitcoinClient.cmd.apply(self.bitcoinClient, args);
        }
        catch(err)
        {
            throw err;
        }
    });
};

module.exports.WsBitcoinService = WsBitcoinService;