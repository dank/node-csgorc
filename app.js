'use strict';

const Steam = require('steam');
const Protos = require('./helpers/protos.js');
const SteamId = require('steamid');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline-sync');

const accounts = fs.readFileSync('./accounts.txt', 'utf8').split('\n');
const steamId = new SteamId(readline.question('SteamID64: '));
const opt = readline.keyInSelect(['Report', 'Commend']);

let matchId;
if (opt == 0)
  matchId = readline.question('Match ID: ');

if (steamId.isValid() && opt >= 0) {
  accounts.forEach(account => {
    if(!account) {
      return;
    }

    const client = new Steam.SteamClient();
    const user = new Steam.SteamUser(client);
    const gc = new Steam.SteamGameCoordinator(client, 730);
    const friends = new Steam.SteamFriends(client);

    const param = account.split(':');
    let login = {
      account_name: param[0],
      password: param[1].replace(/[\n\t\r]/g,"")
    };

    let keepAlive;
    fs.access(`/sentry/${param[0]}`, fs.F_OK, err => {
      if (!err) {
        console.info(`[${param[0]}] Sentryfile found!`);
        login.sha_sentryfile = fs.readFileSync(`/sentry/${param[0]}`);
      }
    });

    console.info(`[${param[0]}] Logging in...`);

    client.connect();
    client.on('connected', () => {
      user.logOn(login);
    });

    client.on('logOnResponse', res => {
      const eresult = res.eresult;

      if (eresult === Steam.EResult.OK) {
        console.info(`[${param[0]}] Logged in!`);

        friends.setPersonaState(Steam.EPersonaState.Offline);
        user.gamesPlayed({
          games_played: [{
            game_id: 730
          }]
        });

        keepAlive = setInterval(() => {
          gc.send({
            msg: 4006,
            proto: {}
          }, new Protos.CMsgClientHello({}).toBuffer());
        }, 2000);
      } else if (eresult === Steam.EResult.AccountLoginDeniedNeedTwoFactor) {
        login.two_factor_code = readline.question(`[${param[0]}] Mobile auth code: `);
        client.disconnect();
        client.connect();
      } else if (eresult === Steam.EResult.AccountLogonDenied) {
        login.auth_code = readline.question(`[${param[0]}] Steam Guard code: `);
        client.disconnect();
        client.connect();
      } else {
        console.error(res);
      }
    });

    user.on('updateMachineAuth', (data, next) => {
      function SHA1(bytes) {
        let shasum = crypto.createHash('sha1');
        shasum.end(bytes);
        return shasum.read();
      }

      fs.writeFileSync(`./sentry/${param[0]}`, SHA1(data.bytes));
      next({sha_file: SHA1(data.bytes)});
    });

    client.on('error', err => {
      console.error(`[${param[0]}] ${err}`);
      client.disconnect();
    });

    gc.on('message', (header, buffer, next) => {
      switch (header.msg) {
        case 4004:
          clearInterval(keepAlive);
          if (opt == 0) {
            report(gc, steamId, matchId, param[0]);
          } else if (opt == 1) {
            commend(gc, steamId, param[0]);
          } else {
            console.error('idk');
          }
          break;
        case Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientHello:
          break;
        case Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse:
          const confirm = Protos.CMsgGCCStrike15_v2_ClientReportResponse.decode(buffer).confirmationId;
          if (confirm) {
            console.info(`[${param[0]}] Report confirmation ID: ${confirm.toString()}`);
          } else {
            console.info(`[${param[0]}] Commended.`)
          }
          client.disconnect();
          break;
        default:
          console.info(header);
          break;
      }
    });
  });
} else {
  console.error('Invalid input. Killing...');
}

function report(gc, sid, matchid, user) {
  console.info(`[${user}] Reporting...`);

  let accountId = sid.accountid;
  if (matchid === null)
    matchid = 8;
  
  gc.send({
    msg: Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportPlayer,
    proto: {}
  }, new Protos.CMsgGCCStrike15_v2_ClientReportPlayer({
    accountId: accountId,
    matchId: matchid,
    rptAimbot: 2,
    rptWallhack: 3,
    rptSpeedhack: 4,
    rptTeamharm: 5,
    rptTextabuse: 6,
    rptVoiceabuse: 7
  }).toBuffer());
}

function commend(gc, sid, user) {
  console.info(`[${user}] Commending...`);

  let accountId = sid.accountid;
  gc.send({
    msg: Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientCommendPlayer,
    proto: {}
  }, new Protos.CMsgGCCStrike15_v2_ClientCommendPlayer({
    accountId: accountId,
    matchId: 8,
    tokens: 10,
    commendation: new Protos.PlayerCommendationInfo({
      cmdFriendly: 1,
      cmdTeaching: 2,
      cmdLeader: 4
    })
  }).toBuffer());
}
