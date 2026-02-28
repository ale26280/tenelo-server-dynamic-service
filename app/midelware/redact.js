'use strict';
const mung = require('express-mung');
var CryptoJS = require('crypto-js')
var postsecret = 'omservice'

/* Remove any classified information from the response. */
function redact(body, req, res) {
    if (body.secret) body.secret = '****';
    //console.log(body)
    //body.cr =  CryptoJS.AES.encrypt(JSON.stringify(body.data), postsecret).toString()
    //delete body.data
    //body = {}
    return body;
}

module.exports = mung.json(redact);