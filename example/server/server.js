/**
 * User: https://github.com/korve/
 * Date: 23.05.13
 * Time: 23:41
 */

var wsBitcoin = require("../../index");
var service = new wsBitcoin.WsBitcoinService({
    bitcoinUser: "",
    bitcoinPass: "",
    testnet:     true
});

service.start();

/**
 * Webservice is now reachable at http://localhost:18337/
 */