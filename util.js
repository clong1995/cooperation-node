const path = require('path');
const fs = require('fs');
const querystring = require('querystring');
const Url = require('url');
const http = require('http');

//伪全局变量
const globalVar = new Map([
    ['root', path.join(__dirname, '../../')]
]);

//时间日期
/**
 * 将 Date 转化为指定格式的String * 月(M)、日(d)、12小时(h)、24小时(H)、分(m)、秒(s)、周(E)、季度(q)
 * 可以用 1-2 个占位符 * 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)
 * "yyyy-MM-dd hh:mm:ss.S" ==> 1995-09-19 08:09:04.423
 * "yyyy-MM-dd E HH:mm:ss" ==> 1995-09-19 二 20:09:04
 * "yyyy-MM-dd EE hh:mm:ss" ==> 1995-09-19 周二 08:09:04
 * "yyyy-MM-dd EEE hh:mm:ss" ==> 1995-09-19 星期二 08:09:04
 * "yyyy-M-d h:m:s.S" ==> 1995-9-19 8:9:4.18
 */
function date(fmt = 'yyyy-MM-dd HH:mm:ss', date = new Date()) {
    let o = {
        "M+": date.getMonth() + 1, //月份
        "d+": date.getDate(), //日
        "h+": date.getHours() % 12 === 0 ? 12 : date.getHours() % 12, //小时
        "H+": date.getHours(), //小时
        "m+": date.getMinutes(), //分
        "s+": date.getSeconds(), //秒
        "q+": Math.floor((date.getMonth() + 3) / 3), //季度
        "S": date.getMilliseconds() //毫秒
    };
    let week = {
        "0": "/u65e5",
        "1": "/u4e00",
        "2": "/u4e8c",
        "3": "/u4e09",
        "4": "/u56db",
        "5": "/u4e94",
        "6": "/u516d"
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    if (/(E+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[date.getDay() + ""]);
    }
    for (let k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}

module.exports = {
    ajax: (url, {
        method = 'GET',
        headers = {
            "Content-type": "application/x-www-form-urlencoded"
        },
        data = {},
        callback = null
    } = {}) => {
        //数据
        let postData = querystring.stringify(data);
        //补充头
        headers['Content-Length'] = Buffer.byteLength(postData);
        url = Url.parse(url);

        let req = http.request({
            host: url.hostname,
            path: url.pathname,
            port: url.port || 80,
            method: method,
            headers: headers
        }, res => {
            res.setEncoding('utf-8');
            let receiveData = "";
            res.on('data', data => receiveData += data).on('end', () => {
                let datas = '';
                try {
                    datas = JSON.parse(receiveData);
                } catch (err) {
                    datas = receiveData;
                }
                callback && callback(datas);
            });
        });

        req.on('error', e => callback(e));

        //发送数据
        req.write(postData);
        req.end();
    },

    /**
     * 获取数组最大最小值
     * @param arr
     * @param type
     * @returns {number}
     */
    arrMaxMin: (arr, type = 'max') => type === 'max' ? Math.max(...arr) : Math.min(...arr),

    /**
     * 深度合并和拷贝对象，建议obj2为少的一方
     * @param obj
     * @param obj2
     * @returns {*}
     */
    assignDeep: (obj, obj2) => {
        for (let k in obj2)
            typeof obj2[k] === 'object'
                ? obj[k] === undefined
                ? obj[k] = obj2[k]
                : this.assignDeep(obj[k], obj2[k])
                : obj[k] = obj2[k];
        return obj
    },

    /**
     * 转驼峰写法
     * @param str
     * @returns {string | void | *}
     */
    camelize: str => (!str.includes('-') && !str.includes('_'))
        ? str
        : str.replace(/[-_][^-_]/g, match => match.charAt(1).toUpperCase()),

    /**
     * 首字母大写
     * @param str
     * @returns {string}
     */
    capitalize: str => str.charAt(0).toUpperCase() + str.substring(1),

    /**
     * 克隆数组
     * @param arr
     * @returns {*[]}
     */
    cloneArr: arr => [...arr],

    delGlobal: key => globalVar.delete(key),

    /**
     * 差集
     * @param arr1
     * @param arr2
     * @returns {*[]}
     */
    difference: (arr1, arr2) => [...new Set([...arr1].filter(x => !arr2.has(x)))],

    /**
     * 数组去重
     * @param arr
     * @returns {*[]}
     */
    distinct: arr => [...new Set(arr)],

    getAllGlobal: () => globalVar,

    getGlobal: key => globalVar.get(key),

    hasGlobal: key => globalVar.has(key),

    /**
     * 交集
     * @param arr1
     * @param arr2
     * @returns {*[]}
     */
    intersect: (arr1, arr2) => [...new Set([...arr1].filter(x => arr2.has(x)))],

    /**
     * 向数组的尾部拼接数组
     * @param tagArr 目标数组
     * @param endArr 尾部数组
     * @returns {*|number}
     */
    pushEnd: (tagArr, endArr) => tagArr.push(...endArr),

    /**
     * 随机字母
     * @param len
     * @param type
     * @returns {string}
     */
    randomChar: (len = 4, type = 'upper') => {
        let rc = '';
        for (let i = 0; i < len; ++i)
            rc += String.fromCharCode(65 + Math.ceil(Math.random() * 25));
        return type === 'upper' ? rc : rc.toLowerCase();
    },

    /**
     * 随机数
     * @param minNum
     * @param maxNum
     * @returns {number}
     */
    randomNum: (minNum = 0, maxNum = 1000) => parseInt(Math.random() * (maxNum - minNum + 1) + minNum, 10),

    //存在替换，不存在插入
    replaceGlobal: (key, value) => globalVar.set(key, value),

    //设置全局变量
    setGlobal: (key, value) => globalVar.has(key)
        ? console.error(key + ' 全局变量：已经被使用了！')
        : globalVar.set(key, value),

    /**
     * 获取文本的长度，兼容各种码点的长度
     * @param str
     * @returns {number}
     */
    strLength: str => {
        let size = 0;
        for (let i of str) ++size;
        return size;
    },

    /**
     *  去除空白和指定字符串，无参默认去除左右空白
     * @param str
     * @param char 指定字符 默认：''
     * @param position  left right 默认：''
     * @returns {string}
     */
    trim: (str, {char = '', position = ''} = {}) => {
        if (!str) return str;

        let newStr = '';
        if (char) {
            if (position === 'left')
                newStr = str.replace(new RegExp('^\\' + char + '+', 'g'), '');
            if (position === 'right')
                newStr = str.replace(new RegExp('\\' + char + '+$', 'g'), '');
            if (position === '')
                newStr = str.replace(new RegExp('^\\' + char + '+|\\' + char + '+$', 'g'), '');
        } else
            newStr = str.trim();
        return newStr;
    },

    /**
     * 字符的截断处理
     * @param str
     * @param length
     * @param truncation
     * @returns {string}
     */
    truncate: (str, length = 30, truncation = '...') => str.length > length
        ? str.slice(0, length - truncation.length) + truncation
        : str,

    /**
     * 转划线写法
     * @param str
     * @param type
     * @returns {string}
     */
    underscored: (str, type = '-') => str.replace(/([a-z\d])([A-Z])/g, '$1' + type + '$2').replace(/\-/g, type).toLowerCase(),

    /**
     * 实体转html
     * @param str
     * @returns {string}
     */
    unescapeHTML: str => str.replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, "&") //处理转义的中文和实体字符
        .replace(
            /&#([\d]+);/g,
            ($0, $1) => String.fromCharCode(parseInt($1, 10))
        ),

    /**
     * 并集
     * @param arr1
     * @param arr2
     * @returns {*[]}
     */
    union: (arr1, arr2) => [...new Set([...arr1, ...arr2])],

    updateGlobal: (key, value) => globalVar.set(key, value),


    setLogPath: (path) => {
        fs.exists(path, exists => {
            if (!exists) {//目录不存在
                fs.mkdir(path, function (err) {
                    if (err) {
                        console.log('Failed to create directory for log ', err);
                    } else {
                        globalVar.set('logPath', path)
                    }
                })
            } else {
                globalVar.set('logPath', path)
            }
        })
    },

    /**
     * 输出日志
     * @param str 日志内容
     * @param type 日志类型
     * @param logApi 接收前端日志的后台服务
     */
    log: (str, type = 'log', api) => {
        let name = date('mm:ss.S') + ' EasyScript';
        str = JSON.stringify(str);
        let log = '';
        switch (type) {
            case 'warn':
                log = '[' + name + ' WARN] ' + str;
                break;
            case 'error':
                log = '[' + name + ' ERROR]' + str;
                break;
            case 'log':
                ;
            default:
                log = '[' + name + ' LOG] ' + str;
        }

        console.log(log);

        //写文件
        if (globalVar.has('logPath')) {
            let file = globalVar.get('logPath') + '/' + date('yyyy-MM-dd HH');
            fs.appendFile(file, log + '\r\n', err => {
                if (err) {
                    console.log('Log write failed');
                    return;
                }
            });
        }
    },

    /**
     * 时间格式化
     */
    date: date
};