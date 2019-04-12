const webSocket = require("ws");
const kill = require('kill-port');
const util = require('./util');

const wssDir = util.getGlobal('root') + "main/server/wss";
const wscDir = util.getGlobal('root') + "main/server/wsc";

let wsc = null;
let wss = null;

function server({
                    port = 80,
                    //clientMessage = null,
                    checkInterval = false,
                    serverStart = null,
                    clientConn = null,//当客户端联入后的回调，返回联入的客户端
                    clientClose = null//客户端关闭
                } = {}) {
    //启用http创建一个端口为HOST的服务
    kill(port).then(value => {
        //服务端
        wss = new webSocket.Server({
            port: port,
        });
        //链接
        wss.on('connection', (wsc, req) => {
            let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            ip = ipv4Ip(ip);
            wsc.isAlive = true;
            console.log("ws client connection => ws://" + ip + ':' + port);
            //设备上线
            if (typeof clientConn === 'function') clientConn(wsc, ip);
            //设备消息
            wsc.on('message', data => {
                data = JSON.parse(data);
                let urlArr = data._url.split('/');
                let file = wssDir + '/' + urlArr[2] + '.js';
                delete data._url;
                try {
                    require(file)(urlArr[3], data, wsc);
                } catch (e) {
                    console.error(e.message);
                }
            });

            wsc.on('close', () => {
                let ip = ipv4Ip(wsc._socket.remoteAddress);
                console.error("ws client connection close => ws://" + ip + ':' + port);
                wsc.isAlive = false;
                if (typeof clientClose === 'function') clientClose(wsc);
                wsc.terminate();
                console.log('ws client size ' + wss.clients.size);
            });

            wsc.on('pong', () => {
                console.log('on pong');
                wsc.isAlive = true
            });
            console.log('ws client size ' + wss.clients.size);
        });
        if (checkInterval) {
            //主动检测，10秒内不回复即为离线
            setInterval(() => {
                wss.clients.forEach(wsc => {
                    if (wsc.isAlive === false) {
                        //TODO 设备离线，主动上报给服务器
                        console.log('ws client no pong,remove client');
                        return wsc.terminate();
                    }
                    wsc.isAlive = false;
                    wsc.ping();
                });
            }, checkInterval)
        }
        //启动成功的回调
        if (typeof serverStart === 'function') serverStart(wss);
        console.log("ws server listen port =>" + port);
    }, reason => {
        console.error(reason);
        return;
    })
}

function client({
                    ip = '127.0.0.1',
                    port = 80,
                    checkInterval = false,//自动检测状态时间
                    clientOpen = null,
                    clientClose = null,
                    duration = 5000//断线重连间隔
                } = {}) {
    wsc = new webSocket('ws://' + ip + ':' + port);
    let error = false;
    //连接成功
    wsc.onopen = () => {
        console.log("ws client connection Successful => ws://" + ip + ':' + port);
        if (typeof clientOpen === 'function') clientOpen(wsc);
        //登陆
        /*wsc.send(JSON.stringify({
            key: 'login',
            value: key
        }));*/
    };

    let pingTimeout = null;

    if (checkInterval) {
        wsc.on('ping', () => {
            console.log('on ping');
            clearTimeout(pingTimeout);
            pingTimeout = setTimeout(() => {
                wsc.terminate();
            }, checkInterval + 1000);
        });
    }

    reConn = () => {
        duration && setTimeout(() => {
            wsc.terminate();
            wsc = null;
            client({
                ip: ip,
                port: port,
                clientOpen: clientOpen,
                clientClose: clientClose,
                duration: duration,
                checkInterval: checkInterval
            })
        }, duration);
    }


    //连接错误
    wsc.onerror = () => {
        clearTimeout(pingTimeout);
        //初次连接失败
        console.error("ws client connection error => ws://" + ip + ':' + port);
        if (typeof clientClose === 'function') clientClose(wsc);
        error = true;
        reConn();
    };
    wsc.onclose = () => {
        clearTimeout(pingTimeout);
        if (!error) {//避免重复连接
            //连接成功后掉线
            console.error("ws client connection close => ws://" + ip + ':' + port);
            if (typeof clientClose === 'function') clientClose(wsc);
            reConn();
        }
    };
    //接收消息
    wsc.onmessage = e => {
        let data = JSON.parse(e.data);
        let urlArr = data._url.split('/');
        let file = wscDir + '/' + urlArr[2] + '.js';
        delete data._url;
        try {
            require(file)(urlArr[3], data, wsc);
        } catch (e) {
            console.error(e.message);
        }
    }
}


function clientSend(url, {
    data = {}
} = {}) {
    data._url = url;
    wsc.send(JSON.stringify(data));
}

function serverSendToClient(wsc, url, data) {
    data['_url'] = url;
    //console.log(data);
    wsc.send(JSON.stringify(data));
}

function ipv4Ip(ip) {
    return ip.substr(0, 7) == "::ffff:" ? ip.substr(7) : ip;
}

function getWss() {
    return wss;
}

function getClients() {
    return wss.clients;
}

module.exports = {
    server: server,
    client: client,
    clientSend: clientSend,
    getClients: getClients,
    getWss: getWss,
    serverSendToClient: serverSendToClient
};