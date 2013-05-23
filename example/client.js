/**
 * User: https://github.com/korve/
 * Date: 21.05.13
 * Time: 17:11
 */

$(function(){
    var domConsole = $("#console");
    var origConsoleContent = domConsole.val();

    function writeLog(msg, level)
    {
        if(typeof level == "undefined")
            level = "DEBUG";

        domConsole.val(domConsole.val() + level.toUpperCase() + ": " + msg + "\r\n");
    }

    function clearLog()
    {
        domConsole.val(origConsoleContent);
    }

    function showSelectAccountDialog(callback){
        var chooseAccountDialogAccountList = $("#choose-account ul");
        chooseAccountDialogAccountList.empty();

        $.each(accounts, function(account){

            var accountName = account;
            if(accountName.length == "")
                accountName = "[empty]";

            chooseAccountDialogAccountList.append("<li><a href=\"#" + account + "\">" + accountName + "</a></li>")
        });

        chooseAccountDialog.data("accountSelectedCallback", callback);
        chooseAccountDialog.dialog("open");
    };

    function showSelectTransactionDialog(callback){
        var chooseTransactionDialogTransactionList = $("#choose-transaction ul");
        chooseTransactionDialogTransactionList.empty();

        $.each(transactions, function(i, transaction){


            chooseTransactionDialogTransactionList.append("<li><a href=\"#" + transaction.txid + "\">" + transaction.amount + " btc (" + new Date(transaction.time * 1000).toDateString() + ")</a></li>")
        });

        chooseTransactionDialog.data("transactionSelectedCallback", callback);
        chooseTransactionDialog.dialog("open");
    };

    var chooseAccountDialog = $("#choose-account").dialog({
        modal: true,
        autoOpen: false,
        buttons: {
            Cancel: function() {
                $( this ).dialog( "close" );
            }
        }
    });

    var chooseTransactionDialog = $("#choose-transaction").dialog({
        modal: true,
        autoOpen: false,
        width: "50%",
        buttons: {
            Cancel: function() {
                $( this ).dialog( "close" );
            }
        }
    });

    //select account action
    $("#choose-account").on("click", "ul li a", function(e){
        e.preventDefault();

        var account = $(this).attr("href").replace("#", "");

        var cb = chooseAccountDialog.data("accountSelectedCallback");
        cb(account);

        chooseAccountDialog.dialog("close");
    });

    $("#choose-transaction").on("click", "ul li a", function(e){
        e.preventDefault();

        var account = $(this).attr("href").replace("#", "");

        var cb = chooseTransactionDialog.data("transactionSelectedCallback");
        cb(account);

        chooseTransactionDialog.dialog("close");
    });

    /**
     * Socket example implementation
     */
    var serviceAddress = "http://localhost:18337";
    var socket = io.connect(serviceAddress);
    var requestId = 0;
    /**
     * A list containing accounts from the last listaccounts request
     * @type {Array}
     */
    var accounts = [];
    /**
     * A list containing transactions from the last listtransactions request
     * @type {Array}
     */
    var transactions = [];

    socket.on('connect', function (data) {
        writeLog("Connected to ws-bitcoin service at " + serviceAddress)

        //get accounts for further actions
        callWsBitcoinService("listaccounts", null, false);

        $("#actions a[href]").click(function(e){
            e.preventDefault();

            var action = $(this).attr("href").replace("#", "");

            if(action == "clear")
            {
                clearLog();
                return;
            }

            //call hook for this action if one is present.
            if(action in actionHooks)
                actionHooks[action]();
            else
                callWsBitcoinService(action);
        });
    });

    socket.on('disconnect', function (data) {
        writeLog("Disconnected from ws-bitcoin service at " + serviceAddress);
        $("#actions a").unbind("click");
    });

    socket.on('apiResponse', function (data) {
        writeLog("Received apiResponse " + data.action + ", result: " + JSON.stringify(data.result));

        if(data.action in responseHooks)
            responseHooks[data.action](data);
    });

    /**
     * Calls the ws-bitcoin service
     * @param action    The name of the action. (usually is the Bitcoin Client api call name)
     * @param args      An array containing arguments for this call
     * @param silent    Set to true to prevent output to the log
     */
    function callWsBitcoinService(action, args)
    {
        if(args instanceof Array === false)
            args = [];

        if(typeof silent == "undefined")
            silent = false;

        socket.emit("apiCall", {
            "action":   action,
            "args":     args
        });

        writeLog("ApiCall \"" + action + "\" sent");
    };

    /**
     * If a action hook is defined for a specific action it will be called instead of the
     * default function
     * @type {{listtransactionsByAccount: Function, gettransaction: Function}}
     */
    var actionHooks = {
        listtransactionsByAccount: function(){
            showSelectAccountDialog(function(selectedAccount){
                callWsBitcoinService("listtransactions", [selectedAccount]);
            });
            //callWsBitcoinService("listtransactions", []);
        },
        gettransaction: function(){
            showSelectAccountDialog(function(selectedAccount){
                callWsBitcoinService("listtransactions", [selectedAccount]);

                //TODO: wait for listtransactions to finish
                setTimeout(function(){

                    showSelectTransactionDialog(function(selectedTransaction){
                        callWsBitcoinService("gettransaction", [selectedTransaction]);
                    });

                }, 100);

            });
        },
        getrawtransaction: function(){

            showSelectAccountDialog(function(selectedAccount){
                callWsBitcoinService("listtransactions", [selectedAccount]);

                //TODO: wait for listtransactions to finish
                setTimeout(function(){

                    showSelectTransactionDialog(function(selectedTransaction){
                        callWsBitcoinService("getrawtransaction", [selectedTransaction]);
                    });

                }, 100);

            });

        }
    };

    /**
     * If a action hook is defined for a specific response it will be called with an argument containing the response
     * @type {{listaccounts: Function, listtransactions: Function}}
     */
    var responseHooks = {
        listaccounts: function(data){
            accounts = data.result;
        },
        listtransactions: function(data){
            transactions = data.result;
        }
    };

});
