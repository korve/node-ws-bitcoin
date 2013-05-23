/**
 * User: https://github.com/korve/
 * Date: 21.05.13
 * Time: 16:43
 */

var fs = require("fs");
var io = require("socket.io").listen(18337, {
    'browser client minification':  true,
    'log level': 3
});
var bitcoin = new require("bitcoin");
var config = new require("./config/config").config;

var bitcoinClientConfig = {
    host:   config.rpcHost,
    port:   config.rpcPort,
    user:   config.rpcUser,
    pass:   config.rpcPass
};

if(config.ssl === true)
{
    bitcoinClientConfig.ssl         = true;
    bitcoinClientConfig.sslStrict   = config.rpcSslStrict;
    bitcoinClientConfig.sslCa       = fs.readFileSync(__dirname + config.rpcSslCertificate);
}

bitcoinClient = new bitcoin.Client(bitcoinClientConfig);

io.sockets.on('connection', function (socket) {

    socket.on('apiCall', function (data) {
        var action = data.action;
        var args = data.args;

        if(typeof action != "string" || action.length == 0)
        {
            throw new Error("Invalid action parameter for apiCall");
        }

        if(args instanceof Array === false)
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
        bitcoinClient.cmd.apply(bitcoinClient, args);
    });
});