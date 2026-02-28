const assert = require("assert");
const client = require("mongodb").MongoClient;
let _db;

//https://itnext.io/https-medium-com-yarindeoh-light-authentication-with-nodejs-express-and-external-provider-3ad65e637608

const urlmongo = 'mongodb://' + process.env.MONGO_HOST + ':' + process.env.MONGO_PORT

function initDb(callback) {
    if (_db) {
        console.warn("Trying to init DB again!");
        return callback(null, _db);
    }
    
    client.connect(urlmongo, { 
        useNewUrlParser: true ,  
        useUnifiedTopology: true
    }, connected);
    
    function connected(err, db) {
        if (err) {
            return callback(err);
        }
        console.log("DB initialized - connected to: " + urlmongo);
        _db = db;
        return callback(null, _db);
    }
}

function getDb() {
    assert.ok(_db, "Db has not been initialized. Please called init first.");
    return _db;
}

module.exports = {
    getDb,
    initDb
};