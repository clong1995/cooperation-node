//TODO 里面处在同步事件，需要优化
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// 将我们需要的文件扩展名和MIME名称列出一个字典
const mimeNames = {
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "application/x-png",
    ".gif": "image/gif",
    ".ogg": "application/ogg",
    ".ogv": "video/ogg",
    ".oga": "audio/ogg",
    ".wav": "audio/x-wav",
    ".webm": "video/webm",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json"
};

function sendResponse(response, responseStatus, responseHeaders, readable) {
    response.writeHead(responseStatus, responseHeaders);

    if (!readable)
        response.end();
    else
        readable.on("open", () => readable.pipe(response));

    return null;
}

function getMimeNameFromExt(ext) {
    let result = mimeNames[ext.toLowerCase()];
    if (!result)
        result = "application/octet-stream";
    return result;
}

function readRangeHeader(range, totalLength) {
    if (!range || !range.length)
        return null;

    let array = range.split(/bytes=([0-9]*)-([0-9]*)/);
    let start = parseInt(array[1]);
    let end = parseInt(array[2]);
    let result = {
        Start: isNaN(start) ? 0 : start,
        End: isNaN(end) ? (totalLength - 1) : end
    };

    if (!isNaN(start) && isNaN(end)) {
        result.Start = start;
        result.End = totalLength - 1;
    }

    if (isNaN(start) && !isNaN(end)) {
        result.Start = totalLength - end;
        result.End = totalLength - 1;
    }

    return result;
}

module.exports = ({
                      port = 80,
                      dir = ['/']
                  } = {}) => {
    http.createServer((request, response) => {


        /*
        //下面主要是GET类的
        if (request.method !== 'GET') {
            sendResponse(response, 405, {'Allow': 'GET'}, null);
            return null;
        }*/

        let rqePath = url.parse(request.url, true, true).pathname.split('/').join(path.sep);
        let filename = '';

        if (dir.length === 1) {
            filename = dir[0] + rqePath;
            if (!fs.existsSync(filename)) {
                sendResponse(response, 404, null, null);
                return null;
            }
        } else {
            let has = false;
            dir.some(v => {
                filename = v + rqePath;
                if (fs.existsSync(filename)) {
                    has = true;
                }
                return has;
            });
            if (!has) {
                sendResponse(response, 404, null, null);
                return null;
            }
        }

        let ext = path.extname(filename);
        let responseHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': getMimeNameFromExt(ext),
            'Cache-Control': 'no-cache',
            'Accept-Ranges': 'bytes'
        };

        if (request.method === 'POST') {//POST的时候，就不走GET了
            if (ext !== '.json' || ext) {
                sendResponse(response, 404, null, null);
                return null;
            }

            let postData = "";
            //持续读写内容，因为post可能很大
            request.on("data", data => postData += data);
            request.on("end", () => {
                try {
                    postData = JSON.parse(postData);
                    if (ext === '.json') {
                        responseHeaders['Content-Length'] = stat.size;
                        sendResponse(response, 200, responseHeaders, fs.createReadStream(filename));
                        return null;
                    } else if (!ext) {
                        //TODO 处理请求的脚本
                        //require(file)(arr[3], postData, data => output(res, data, 'api'));
                        sendResponse(response, 500, null, null);
                        return null;
                    }
                } catch (err) {
                    sendResponse(response, 500, null, null);
                    return null;
                }
            });
        } else {
            let stat = fs.statSync(filename);
            let rangeRequest = readRangeHeader(request.headers['range'], stat.size);

            //没有分片的需求
            if (rangeRequest == null) {
                responseHeaders['Content-Length'] = stat.size;  // File size.
                sendResponse(response, 200, responseHeaders, fs.createReadStream(filename));
                return null;
            }

            //开始分片
            let start = rangeRequest.Start;
            let end = rangeRequest.End;

            if (start >= stat.size || end >= stat.size) {
                responseHeaders['Content-Range'] = 'bytes */' + stat.size;
                sendResponse(response, 416, responseHeaders, null);
                return null;
            }

            responseHeaders['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
            responseHeaders['Content-Length'] = start === end ? 0 : (end - start + 1);

            sendResponse(response, 206, responseHeaders,
                fs.createReadStream(filename, {start: start, end: end}));
        }
    }).listen(port);
};