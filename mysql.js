const mysql = require('mysql');

let pool = null;
function conn(config) {
    //连接池
    pool = mysql.createPool(config);
    // Attempt to catch disconnects
    pool.on('connection', connection=> {
        console.log('DB Connection established');

        connection.on('error',  err=> console.error('MySQL error', err.code));

        connection.on('close', err=> console.error('MySQL close', err));
    });

}

function getPool(){
    return pool;
}

module.exports = {
    conn: conn,
    getPool:getPool
};