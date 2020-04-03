const discord   = require('discord.js');
const settings  = require("./settings")
const https     = require('https')
const crypto    = require('crypto')

const cbUrl = "https://www.cleverbot.com"
const cbHostname = "www.cleverbot.com"
const cbPort = 443
const cbApi = '/webservicemin?uc=UseOfficialCleverbotAPI&' 
const cbMaxHistoryEntries = 7

var guildSessions = {}

function extractCookie(cookieName, cookieString) {
    const idxStart = cookieString.indexOf(cookieName + "=") + cookieName.length + 1;
    const idxEnd = cookieString.indexOf(";", idxStart);
    
    return cookieString.slice(idxStart, idxEnd)
}

function initCleverbotSession(sessionData, onSucceed, onFail){
    const options = {
        hostname: cbHostname,
        port: cbPort,
        path: '/',
        method: 'GET'
    }

    const req = https.request(options, res => {
        if(res.statusCode == 200){
            sessionData.xvis = extractCookie("XVIS", res.headers["set-cookie"][0])
            //console.log("Session initialized successfully. XVIS: " + sessionData.xvis)

            onSucceed()
        }
        else 
            onFail("Could not initialize session. HTTP error code: " + res.statusCode)
    })
    req.end()
}

function postCleverbotMessage(message, sessionData, onSuccess, onFail) {
    var data = "stimulus=" + encodeURIComponent(message)

    if(!sessionData.history)
        sessionData.history = [];

    for(var i = 0;i < sessionData.history.length;i++){
        data += "&vText" + (i + 2) + "=" + encodeURIComponent(sessionData.history[i])
    }

    sessionData.history.unshift(message)
    if(sessionData.history.length > cbMaxHistoryEntries)
        sessionData.history.pop()

    data += "&cb_settings_language=&cb_settings_scripting=no&islearning=1"

    const options = {
            hostname: cbHostname,
            port: cbPort,
            path: cbApi,
            method: 'POST',
            headers: {
                'Cookie': 'XVIS=' + sessionData.xvis + ';_cbsid=-1;Path=/;',
                'Content-Type': 'text/plain;charset=UTF8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Origin': cbUrl,
                'Referer': cbUrl,
                'Accept-Language': 'en-US,en;q=0.9,nl-BE;q=0.8,nl;q=0.7',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36'
            }
        }

    sessionData.lastTime = Math.round((new Date()).getTime() / 1000) 

    if(sessionData.xai != undefined)
        options.headers['Cookie'] += ';XAI=' + sessionData.xai
    if(sessionData.convoId != undefined){
        options.headers['Cookie'] += ';CBSID=' + sessionData.convoId
        data += "&sessionid=" + sessionData.convoId 
    }

    var txt = data.slice(7, 33) // These indices are hardcoded in the cleverbot source code
                                // Though, they may change randomly over time. I think.

    data += "&icognoid=wsf&icognocheck=" + crypto.createHash('md5').update(txt).digest('hex') 

    const req = https.request(options, res => {
        //console.log("status: " + res.statusCode)
        //console.log("headers: " + JSON.stringify(res.headers))

        if(res.statusCode == 200){
            sessionData.xai = extractCookie('XAI', res.headers['set-cookie'][0])
            sessionData.convoId = res.headers['cbconvid']

            const response = decodeURIComponent(res.headers['cboutput'])

            sessionData.history.unshift(response)
            if(sessionData.history.length > cbMaxHistoryEntries)
                sessionData.history.pop()

            onSuccess(response)
        }
        else 
            onFail("Could not send message. HTTP error code: " + res.statusCode)
    })

    options.headers['Content-Length'] = data.length

    //console.log("DATA_OUT: " + data)

    req.write(data)
    req.end()
}

var bot = new discord.Client()

bot.on('message', msg => {

    // Only respond if a user is @'ing the bot.
    const idxStart = msg.content.toLowerCase().indexOf("<@!" + settings.BOT_CLIENTID + ">")
    if(idxStart !== -1)
    {
        var message = msg.content
        message = message.slice(0, idxStart) + message.slice(idxStart + settings.BOT_CLIENTID.length + 4)

        //console.log("INPUT: " + message)

        const curTime = Math.round((new Date()).getTime() / 1000)
        var createNewSession = false

        if(!guildSessions[msg.guild.id])
            createNewSession = true
        else if(!guildSessions[msg.guild.id].lastTime)
            createNewSession = true 
        else if(curTime - guildSessions[msg.guild.id].lastTime > 259200)
            createNewSession = true 

        if(createNewSession){
            guildSessions[msg.guild.id] = {}

            initCleverbotSession(guildSessions[msg.guild.id], () => {
                postCleverbotMessage(message, guildSessions[msg.guild.id], (response) => {
                    msg.channel.send(response)
                }, (err) => {
                    msg.channel.send("ERROR: " + err)
                })
            },
            (err) => {
                msg.channel.send("ERROR: " + err)
            })
        }
        else {
            postCleverbotMessage(message, guildSessions[msg.guild.id], (response) => {
                msg.channel.send(response)
            }, (err) => {
                msg.channel.send("ERROR: " + err)
            })
        }
    }
})

bot.login(settings.BOT_TOKEN);