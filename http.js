const util = require('./util');
const http = require('http');
const url = require('url');
//const querystring = require('querystring');
const fs = require("fs");
const path = require("path");
const minify = require('html-minifier').minify;
const terser = require("terser");
const kill = require('kill-port');
//多网卡情况后期支持测试

/**
 * http服务，
 * 前端友好无干扰，前端不需要做任何配置和多余的工作
 * 需要依赖前端的EasyScript库的base.class.js
 *  特色：
 *  1、高性能，极轻量hppt服务
 *  2、动静分离
 *  3、修改后端代码免重启
 *  4、资源合并，降低请求量
 *  5、资源缓存，降低磁盘io
 *  6、首屏数据、首屏渲染，缩短相应时间，提升用户体验（有空再搞）
 *  7、自动前端模块化处理，降低前端非业务逻辑复杂度
 *  8、前端定向缓存减少请求
 * @param port 监听端口
 * @param dev 是否开启开发者开关，开启后代码修改免重启，生产环境一定为false或者不填写！！
 */
const cacheMap = new Map();
let cacheRes = false;

//约定的目录结构
const
    pageDir = util.getGlobal('root') + 'main/public/page',
    publicDir = util.getGlobal('root') + "main/public",
    resourceDir = util.getGlobal('root') + "main/public/resource",
    apiDir = util.getGlobal('root') + "main/server/api/";

module.exports = ({
                      port = 80,//端口
                      cb = null,//回调
                      cors = false,//跨域
                      dev = false,//开发模式
                      cache = false,//静态资源
                      requestInterceptor = null //api的header拦截器
                  } = {}) => {

    if (cache) console.warn("开启缓存模式提高性能的同时会产生内存消耗，详情参见http://clong.com!");
    cacheRes = cache;


    //TODO 检查目录结构是否存在，不存在则创建

    let server = (req, res) => {
        if (cors) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Credentials', true);
            res.setHeader("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
            res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        }
        let pathname = url.parse(req.url).pathname;
        if (pathname === '/') pathname += 'index';
        let arr = pathname.split('/');


        if (arr[1] === 'api') {//api的路由
            if (arr.length < 4) {
                output(res, null);
                return;
            }

            let file = apiDir + arr[2] + '.js';
            fs.exists(file, exists => {
                if (!exists) {
                    output(res, null);
                } else {
                    //相应请求
                    //let data = null;
                    if (req.method.toUpperCase() === 'POST') { //POST
                        let postData = "";
                        //持续读写内容，因为post可能很大
                        req.on("data", data => postData += data);
                        req.on("end", () => {
                            try {
                                postData = JSON.parse(postData);
                                //拦截器 同步，可以优化为异步
                                if (typeof requestInterceptor === 'function') {
                                    let flag = requestInterceptor(req, postData);
                                    if (flag) {
                                        output(res, flag, 'api');
                                        return;
                                    }
                                }
                                require(file)(arr[3], postData, data => output(res, data, 'api'));
                            } catch (err) {
                                console.log('====>', err);
                                output(res, err.message, 'err');
                            }
                        });
                    } else if (req.method.toUpperCase() === 'GET') {//GET
                        try {
                            let getData = url.parse(req.url, true).query;
                            if (typeof requestInterceptor === 'function') {
                                let flag = requestInterceptor(req, getData);
                                if (flag) {
                                    output(res, flag, 'api');
                                    return;
                                }
                            }
                            require(file)(arr[3], getData, data => output(res, data, 'api'));
                        } catch (err) {
                            output(res, err.message, 'err');
                        }
                    } else if (req.method.toUpperCase() === 'OPTIONS') {
                        if (cors) {
                            res.writeHead(200);
                            res.end();
                        } else {
                            res.writeHead(403, {'Content-Type': 'text/html;charset=utf-8'});
                            res.end('不允许跨域');
                        }
                    }
                }
            });
        } else if (arr[1] === 'resource') {//公共静态资源
            let file = publicDir + pathname;
            output(res, file);
        } else {
            if (path.extname(pathname)) {//资源
                let file = null;
                if (arr.length === 4) {
                    file = pageDir + pathname;
                } else if (arr.length === 5) {
                    file = pageDir + '/' + arr[1] + '/module/' + arr[2] + '/' + arr[3] + '/' + arr[4];
                }
                output(res, file);
            } else {
                //页面资源
                let pathDir = pageDir + '/' + arr[1];

                fs.exists(pathDir + '/', exists => {
                    if (!exists) {
                        output(res, null);
                    } else {
                        //读取缓存
                        if (!dev && cacheMap.has(pathDir + '/')) {
                            res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
                            res.end(cacheMap.get(pathDir + '/'));
                            return;
                        }
                        //并行拼装文件
                        let step = 0;
                        let files = {'style.css': '', 'app.html': '', 'script.js': ''};
                        for (let f in files) {
                            let file = pathDir + '/' + f;
                            fs.readFile(file, 'utf8', (err, data) => {
                                if (err) {
                                    if (f === 'app.html') {
                                        output(res, null);
                                        return;
                                    }
                                    data = '';
                                }
                                files[f] = data;
                                ++step;
                                if (step === 3) {//文件读取完毕，

                                    //编译html中的图片路径
                                    files['app.html'] = htmlImgCompiler(arr[1], '', files['app.html']);

                                    //编译css中的图片
                                    files['style.css'] = moduleCssCompiler(arr[1], '', files['style.css']);
                                    //执行拼装
                                    make(files, pathDir, html => {
                                        //压缩
                                        if (!dev) {
                                            html = minify(html, {
                                                collapseWhitespace: true,
                                                conservativeCollapse: true,
                                                keepClosingSlash: true,
                                                minifyCSS: true,
                                                minifyJS: (text, inline) => terser.minify(text).code,
                                                minifyURLs: true,
                                                removeScriptTypeAttributes: true,
                                                removeStyleLinkTypeAttributes: true,
                                                removeComments: true
                                            });
                                        }

                                        //输出
                                        output(res, html, 'page');
                                        //缓存
                                        !dev && cacheMap.set(pathDir + '/', html);
                                    });
                                }
                            })
                        }
                    }
                })
            }
        }
    }

    //启用http创建一个端口为HOST的服务
    kill(port).then(value => {
        http.createServer(server).listen(port);
        console.log('http listen port => ' + port);
        if (typeof cb === 'function') {
            cb();
        }
    }, reason => {
        console.error(reason);
        return;
    })
};


function output(res, file, type = null) {
    let ContentType = 'charset=utf-8';

    //404
    if (!file) {
        res.writeHead(404, {'Content-Type': ContentType});
        res.end();
        return;
    }

    //API
    if (type === 'api') {
        res.writeHead(200, {'Content-Type': 'application/json;' + ContentType});
        res.end(file);
        return;
    }

    //500
    if (type === 'err') {
        res.writeHead(500, {'Content-Type': ContentType});
        res.end(file);
        return;
    }

    if (type === 'page') {
        res.writeHead(200, {'Content-Type': 'text/html;' + ContentType});
        res.end(file);
        return;
    }


    //判断扩展名
    switch (path.extname(file)) {
        case '.html':
            ContentType = 'text/html;' + ContentType;
            break;
        case '.js':
            ContentType = 'application/javascript;' + ContentType;
            break;
        case '.css':
            ContentType = 'text/css;' + ContentType;
            break;
        case '.json':
            ContentType = 'application/json;' + ContentType;
            break;
        case '.jpg':
        case '.jpeg':
            ContentType = 'image/jpeg;';
            break;
        case '.png':
            ContentType = 'application/x-png;';
            break;
        case '.gif':
            ContentType = 'image/gif;';
            break;
        default:
            ContentType = 'application/octet-stream;';
    }


    //判断缓存
    if (cacheRes && cacheMap.has(file)) {
        res.writeHead(200, {'Content-Type': ContentType});
        res.end(cacheMap.get(file));
        return;
    }


    fs.exists(file, exists => {
        if (!exists) {
            res.writeHead(404, {'Content-Type': ContentType});
            res.end();
            return;
        }
        fs.readFile(file, (err, data) => {
            if (err) {
                res.writeHead(500, {'Content-Type': ContentType});
                res.end(err.message);
                return;
            }

            res.writeHead(200, {'Content-Type': ContentType});
            res.end(data);
            cacheRes && cacheMap.set(file, data);
        });
    })
}

function make(files, mainPath, cb) {
    let html = files['app.html'],
        style = files['style.css'],
        script = files['script.js'];

    //删除注释
    html = html.replace(/<!--.*-->/gim, '');


    //修改对象
    script = script.replace(/class (\S*) {/, `
    const app = new class{
        constructor() {
            this.moduleMap = new Map();
            this.init();
        }
        getModule(moduleName) {
            return this.moduleMap.get(moduleName);
        }
        setModule(moduleName, module) {
            this.moduleMap.set(moduleName, module);
        }
        destroyModule(moduleName) {
            let module = this.getModule(moduleName);
            module.destroy();
            this.moduleMap.delete(moduleName);
        }
        reloadModule(name = null) {
            name ? this.getModule(name).init()
                : this.moduleMap.forEach(v => v.init  &&v.init());
        }
    `);
    //追加模块操作函数

    //执行new
    script += '()';


    //解析 扩展<module entry=''/>
    let moduleReg = /<module.*?(?:>|\/>)/gi,
        //entry属性
        entryReg = /entry=['"]?([^'"]*)['"]?/i,
        //id属性
        idReg = /id=['"]?([^'"]*)['"]?/i,
        //class属性
        classReg = /class=['"]?([^'"]*)['"]?/i,
        //scope属性
        scopeReg = /scope=['"]?([^'"]*)['"]?/i;

    let arr = html.match(moduleReg);

    if (arr) {
        let moduleLen = arr.length;
        for (var i = 0; i < arr.length; i++) {
            //获取属性
            let moduleStr = arr[i];
            //entry
            let entryRes = arr[i].match(entryReg),
                entryAttr = null;
            //检查entry
            if (entryRes) {
                entryAttr = entryRes[1];
            } else {
                html = html.replace(moduleStr, '<div>模块未定义entry属性</div>');
                moduleLen--;
                if (moduleLen == 0) {
                    //组装
                    html = htmler(style, script, html);
                    cb(html);
                }
                continue;
            }

            //属性
            let attrObj = {};
            //class
            let classRes = arr[i].match(classReg);
            classRes && (attrObj['class'] = classRes[1]);
            //id
            let idRes = arr[i].match(idReg);
            idRes && (attrObj['id'] = idRes[1]);

            //scope
            let scopeRes = arr[i].match(scopeReg);


            //console.log(scopeRes);

            //scopeRes && (attrObj['scope'] = scopeRes[1]);


            //页面资源
            let modulePath = null;
            let pageName = null;
            if (scopeRes && scopeRes[1] === 'global') {
                modulePath = resourceDir + '/module/' + entryAttr;
                pageName = 'resource';
            } else {
                modulePath = mainPath + '/module/' + entryAttr;
                pageName = mainPath.split('page/')[1];
            }

            //======>
            fs.exists(modulePath + '/', exists => {
                //并行拼装文件
                if (!exists) {
                    html = html.replace(moduleStr, '<div>模块目录未找到:' + modulePath + '</div>');
                    moduleLen--;
                    if (moduleLen == 0) {
                        //组装
                        html = htmler(style, script, html);
                        cb(html);
                    }
                } else {
                    let step = 0;
                    let moduleFiles = {'style.css': '', 'app.html': '', 'script.js': ''};
                    for (let f in moduleFiles) {
                        let file = modulePath + '/' + f;
                        fs.readFile(file, 'utf8', (err, data) => {
                            if (err) {
                                data = f === 'app.html' ? '<div>模块目录未找到:' + modulePath + '</div>' : '';
                            }
                            moduleFiles[f] = data;
                            ++step;

                            if (step === 3) {//文件读取完毕，
                                //追加到主页面
                                //替换<module/>

                                html = moduleHtmlCompiler(pageName, attrObj['id'] || entryAttr, moduleFiles['app.html'], moduleStr, html, attrObj);
                                //style追加
                                style += moduleCssCompiler(pageName, attrObj['id'] || entryAttr, moduleFiles['style.css']);
                                //js追加
                                script += moduleJsCompiler(pageName, attrObj['id'] || entryAttr, moduleFiles['script.js']);
                                moduleLen--;
                                if (moduleLen == 0) {
                                    //组装
                                    html = htmler(style, script, html);
                                    cb(html);
                                }
                            }
                        })
                    }
                }
            })
            //============
        }
    } else {
        //组装
        html = htmler(style, script, html);
        cb(html);
    }


}

//组装页面
function htmler(style, script, html) {
    let styleDom = style ? '<style>' + style + '</style>' : '',
        scriptDom = script ? '<script>document.addEventListener("DOMContentLoaded", () => {' + script + '\n})</script>' : '';
    //scriptDom = script ? '<script>window.onload = () => {' + script + '\n}</script>' : '';
    html = html.replace('</head>', styleDom + '</head>');
    html = html.replace('</head>', scriptDom + '</head>');

    return html;
}

//编译html中的图片
function htmlImgCompiler(pageName, moduleName, htmlStr) {

    //追加里面的模块src
    let imgReg = /<img.*?(?:>|\/>)/gi,
        srcReg = /src=['"]?([^'"]*)['"]?/i;
    //所有图片
    let arr = htmlStr.match(imgReg);

    if (arr) {
        let imgLen = arr.length;
        for (var i = 0; i < imgLen; ++i) {
            let srcAttr = arr[i].match(srcReg);
            if (srcAttr && srcAttr.length >= 2) {
                let src = srcAttr[1];
                if (!srcAttr.indexOf('img/')) {
                    //替换掉img标签标签内的src
                    let newImg = arr[i].replace(srcAttr, '/' + pageName + '/' + moduleName + srcAttr);
                    //替换掉页面里的img标签
                    htmlStr = htmlStr.replace(arr[i], newImg);
                } else if (!srcAttr.indexOf('/img/')) {
                    //页面的图片
                    htmlStr = htmlStr.replace(srcAttr, '/' + pageName + srcAttr);
                }
            }
        }
    }
    return htmlStr;
}

//编译html
function moduleHtmlCompiler(pageName, moduleName, htmlStr, moduleStr, html, domAttr) {
    //处理图片
    htmlStr = htmlImgCompiler(pageName, moduleName + '/', htmlStr);
    //处理模块
    let clazz = domAttr['class'] ? ' class="' + domAttr['class'] + '"' : '';
    let id = ' id="' + (domAttr['id'] ? domAttr['id'] : moduleName) + '"';
    html = html.replace(moduleStr, '<div' + clazz + id + '>' + htmlStr + '</div>');
    return html;
}

//编译css
function moduleCssCompiler(pageName, moduleName, cssStr) {
    let backgroundReg = /.*background[^;"]+url\(([^\)]+)\).*/gi,
        urlReg = /url\(['".]?([^'".]*)['".]\)?/i;
    let wrapCss = '';
    let arr = cssStr.match(backgroundReg);
    if (arr) {
        let backgroundLen = arr.length;
        for (var i = 0; i < backgroundLen; i++) {
            let urlArr = arr[i].match(urlReg);
            if(urlArr && urlArr.length >=2){
                let url = urlArr[1]
                if (!url.indexOf('img/')) {
                    //替换内部的
                    let newImg = arr[i].replace(url, '/' + pageName + '/' + moduleName + '/' + url);
                    //替换文件里的
                    cssStr = cssStr.replace(arr[i], newImg);
                } else if (!url.indexOf('/img/')) {
                    let newImg = arr[i].replace(url, '/' + pageName + url);
                    cssStr = cssStr.replace(arr[i], newImg);
                }
            }
        }
    }



    //兼容多写
    let cssArr = cssStr.split('}');
    cssArr.pop();
    cssArr.forEach(v => {
        let start = v.indexOf('{');
        let name = v.substr(0, start);
        let value = v.substr(start || 0);
        if (moduleName) {
            if (name.includes(','))
                name = name.replace(',', ',#' + moduleName + '>');
            wrapCss += '\n#' + moduleName + '>' + name + value + '}'
        } else {
            wrapCss += '\n' + name + value + '}'
        }


    });
    return wrapCss;
}

//编译js
function moduleJsCompiler(pageName, moduleName, jsStr) {
    //jsStr = jsStr.replace(/class (\S*) {/, 'class ' + ejs.capitalize(moduleName) + ' {');
    //js里面也有html
    jsStr = htmlImgCompiler(pageName, moduleName, jsStr);
    //包装
    jsStr = jsStr.replace(/class (\S*) {/, ';\napp.setModule("' + moduleName + '",new class{') + '(app,document.querySelector("#' + moduleName + '")))';
    return jsStr;
}