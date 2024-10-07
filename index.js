const rangeForDefault = [5000, 10000]
const rangeForPremium = [8000, 15000]
const percentForRefer = 40
const dateWeAreWaitingFor = '2024-08-06T19:00:00Z'
const botToken = '6940559137:AAFnbai9PnJ91WszKAYj-oC61WjJmQiEGKM'
const botLink = "https://t.me/friendstonbot/join?startapp"

const TelegramBot = require('node-telegram-bot-api')
const bot = new TelegramBot(botToken, { polling: true })
bot.on("polling_error", console.log)

var fs = require('fs')
var http = require('http')
var https = require('https')
//var privateKey  = fs.readFileSync('sslcert/server.key', 'utf8')
//var certificate = fs.readFileSync('sslcert/server.crt', 'utf8')

const Datastore = require('nedb-promises')
let usersDB = Datastore.create('DBs/users.db')


function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}
function getPercentage(number, percentage) {
  return (number * percentage) / 100
}

async function getUserInfo(tgid) {
  try {
    const photoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos`, {
      params: {
        user_id: tgid
      }
    })

    let avatar = null
    if (photoResponse.data.ok && photoResponse.data.result.total_count > 0) {
      const fileId = photoResponse.data.result.photos[0][0].file_id;
      const fileResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
        params: {
          file_id: fileId
        }
      })
          
      const filePath = fileResponse.data.result.file_path;
      avatar = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    }

    const userResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getChat`, {
      params: {
        chat_id: tgid
      }
    })

    const firstName = userResponse.data.result.first_name;
    return {
      firstName,
      avatar
    }
  } catch (error) {
    console.error('Error fetching user info:', error)
    throw error
  }
}

const axios = require('axios')

async function getReferalsWithBalance(object){
  let referalsArray = object.referals
  for(let i = 0;i<referalsArray.length;i++){
    await usersDB.find({ tgid: referalsArray[i].tgid })
    .then(async function(docs){
      const userInfo = await getUserInfo(docs[0].tgid)
      referalsArray[i].first_name = userInfo.firstName
      referalsArray[i].avatar = userInfo.avatar
      referalsArray[i].balance = docs[0].balance
    })
  }
  await usersDB.update({tgid: object.tgid }, { tgid: object.tgid, balance: object.balance, referals: object.referals })
  return object
}

async function onJoin(thisChatId, premiumOrNot, referCode){
  var toReturn
  await usersDB.find({ tgid: thisChatId })
  .then(async function(docs){
    if(docs.length == 0){
      var generatedFirst, generatedDone
      generatedFirst = getRandomNumber(rangeForDefault[0], rangeForDefault[1])
      if(premiumOrNot == true){
        var generatedSecond = getRandomNumber(rangeForPremium[0], rangeForPremium[1])
        generatedDone = generatedFirst + generatedSecond
      } else{
        generatedDone = generatedFirst
      }
      await usersDB.insert({ tgid: thisChatId, balance: Math.round(generatedDone), referals: [], })
      if(referCode){
        await usersDB.find({ _id: referCode })
        .then(async function(docsRefer){
          if(docsRefer.length > 0){
            const toOutput = await getUserInfo(thisChatId)
            docsRefer[0].referals.push({
              tgid: thisChatId,
              earnedFromHim: getPercentage(generatedDone, percentForRefer),
              firstName: toOutput.firstName,
              avatar: toOutput.avatar
            })
            await usersDB.update({ _id: referCode }, {
              tgid: docsRefer[0].tgid, balance: Math.round(docsRefer[0].balance + getPercentage(generatedDone, percentForRefer)), referals: docsRefer[0].referals
            })
            await usersDB.loadDatabase()
          }
        })
      }
      await usersDB.find({ tgid: thisChatId })
      .then(function(docsFinal){
        toReturn = docsFinal[0]
      })
      toReturn.firstTime = true
    } else if(docs.length == 1){
      toReturn = docs[0]
      toReturn.firstTime = false
    }
  })
  let checker = false

  if(toReturn.referals[0]){
    if(toReturn.referals[0].avatar){
      checker = true
    }
  }
  if(checker == true){
    toReturn = await getReferalsWithBalance(toReturn)
  }
  toReturn.timerWaitingFor = dateWeAreWaitingFor
  toReturn.referalLink = `${botLink}=${toReturn._id}`
  return toReturn
}

async function getTopUsers(){
  var toReturn
  await usersDB.find({})
  .then(async function(docs){
    docs.sort((smaller, bigger) => bigger.value - smaller.value)
    docs = toReturn
  })
  return toReturn
}


const express = require('express')
const path = require('path')
const app = express()
app.use(express.static(path.join(__dirname, 'views')))
app.set('view engine', 'ejs')
app.get('/', (req, res) => {
  if(req.query){
    if(req.query.tgWebAppStartParam){
      res.render('miniapp.ejs', {
        referCode: req.query.tgWebAppStartParam
      })
    } else{
      res.render('miniapp.ejs', {
        referCode: null
      })
    }
  } 
})

const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.post('/loading', async (req, res) => {
  try{
    if(req.body.referCode == ''){
      req.body.referCode = null
    }
    var result
    if(req.body.referCode){
      result = await onJoin(req.body.thisChatId, req.body.isPremium, req.body.referCode)
    } else{
      result = await onJoin(req.body.thisChatId, req.body.isPremium)
    }
    res.send(result)
    if(result.firstTime == true){
      bot.sendPhoto(req.body.thisChatId, "./hello.png",
        {
          reply_markup: {
            inline_keyboard: [
              [{text: "Join community", url: "https://t.me/friends_announcement"}],
              [{text: "Open app", url: "https://t.me/friendstonbot/join"}]
            ]
          }
        }
      )  // Отправка сообщения юзеру в бота при старте аппки
    }
  } catch(err){
    console.log(err)
  }
})

app.post('/getavatar', async (req, res) => {
  var toReturn = []
  for(let i = 0;i<req.body.referals.length;i++){
    toReturn.push(
      await getUserInfo(req.body.referals[i].tgid)
    )
  }
  res.send(toReturn)
})

const adminChatId = 6077340402

var index = 0
bot.on('message', async (msg) => {
  let thisChatId = msg.chat.id
  let messageText = msg.text

  if(thisChatId == adminChatId){
    if(messageText == "/start"){
      bot.sendMessage(thisChatId, "Привет, админ!", {
        reply_markup: {
          keyboard: [
            ["Статистика"],
            ["Рассылка"]
          ]
        }
      })
    } else if(messageText == "Статистика"){
      await usersDB.find({})
      .then(function(docs){
        bot.sendMessage(thisChatId, `Всего в боте ${docs.length} пользователей`)
      })
    } else if(messageText == "Рассылка"){
      bot.sendMessage(thisChatId, "Отправь нужное сообщение или /back для отмены")
      index = 1
    } else if(index == 1 && messageText == "/back"){
      bot.sendMessage(thisChatId, "Действие отменено")
      index = 0
    } else if(index == 1){
      await usersDB.find({})
      .then(function(docs){
        for(let i = 0;i<docs.length;i++){
          bot.sendMessage(docs[i].tgid, messageText)
        }
        index = 0
      })
    }
  } else if(messageText == "/start"){
    bot.sendPhoto(thisChatId, "./hello.png",
      {
        reply_markup: {
          inline_keyboard: [
            [{text: "Join community", url: "https://t.me/friends_announcement"}],
            [{text: "Open app", url: "https://t.me/friendstonbot/join"}]
          ]
        }
      }
    )
  }
  
})

async function updateForCheckSub(docs){
  docs[0].subbed1 = true
  docs[0].balance += 10000
  await usersDB.update({tgid: docs[0].tgid}, docs[0])
  await usersDB.loadDatabase()
}

app.post('/checksub', async (req, res) => {
  bot.getChatMember(-1002153166543, req.body.tgid).then(async (response) => {
    if(response.status == "member"){
      await usersDB.find({tgid: req.body.tgid})
      .then(async function(docs){
        if(docs.length > 0){
          if(docs[0].subbed1){
            res.send({subbed: true})
            console.log("he is just subbed")
          } else{
            console.log(docs[0])
            res.send({subbed: true, justSubbed: true})
            await updateForCheckSub(docs)
          }
        }
      })
    } else{
      await usersDB.find({tgid: req.body.tgid})
      .then(function(docs){
        if(docs.length > 0){
          if(docs[0].subbed1){
            if(docs[0].subbed1 == true){
              res.send({subbed: true})
            }
          } else{
            res.send({subbed: false})
          }
        }
      })
    }
    
  })
})


//var credentials = {key: privateKey, cert: certificate}
var httpServer = http.createServer(app)
//var httpsServer = https.createServer(credentials, app)
httpServer.listen(5000)
//httpsServer.listen(443)