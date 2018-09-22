/* global game: false, token: false, firebase: false */
let socket;
let lastKill = "";//eslint-disable-line no-unused-vars
let lastKillTimeout = 0;//eslint-disable-line no-unused-vars

let players = [];//eslint-disable-line no-unused-vars
let bombs = [];//eslint-disable-line no-unused-vars

let myId = null;//eslint-disable-line no-unused-vars
let isDead = false;//eslint-disable-line no-unused-vars
let blocks = [];
let resetTime;//eslint-disable-line no-unused-vars

const rewrites = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  i: "up",
  k: "down",
  j: "left",
  l: "right",
  w: "w",
  s: "s",
  a: "a",
  d: "d",
  r: "respawn"
};

const killAudio = new Audio("/sounds/kill.ogg");
const shootAudio = new Audio("/sounds/shoot.ogg");

const convertBase = (value, from_base, to_base) => {
  value = value.toString();
  var range = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/".split("");
  var from_range = range.slice(0, from_base);
  var to_range = range.slice(0, to_base);

  var dec_value = value.split("").reverse().reduce(function (carry, digit, index) {
    if (from_range.indexOf(digit) === -1) throw new Error("Invalid digit `"+digit+"` for base "+from_base+".");
    return carry += from_range.indexOf(digit) * (Math.pow(from_base, index));
  }, 0);

  var new_value = "";
  while (dec_value > 0) {
    new_value = to_range[dec_value % to_base] + new_value;
    dec_value = (dec_value - (dec_value % to_base)) / to_base;
  }
  return new_value || "0";
};

const parseResponse = str => {
  const parts = [];
  const players = [];
  const bombs = [];
  let isPlayer = true;

  str.split("").forEach(char => {
    if(char === "!" || char === "?"){
      parts.push(char);
    }else{
      parts[parts.length - 1] += char;
    }
  });

  parts.forEach(part => {
    if(part[0] === "?") isPlayer = false;

    const values = part.slice(1).split("=");
    if(isPlayer){
      players.push({
        x: parseInt(convertBase(values[0], 64, 10)),
        y: parseInt(convertBase(values[1], 64, 10)),
        id: parseInt(convertBase(values[2], 64, 10)),
        direction: ({
          "u": "up",
          "d": "down",
          "l": "left",
          "r": "right"
        })[values[3]],
        width: 20,
        height: 20
      });
    }else{
      bombs.push({
        x: parseInt(convertBase(values[0], 64, 10)),
        y: parseInt(convertBase(values[1], 64, 10)),
        size: 10
      });
    }
  });

  return {players, bombs};
};

const playBtn = document.querySelector("#play");
const playAccountBtn = document.querySelector("#play-account");

const getHost = (suppliedHost) => {
  let host = suppliedHost;
  if(!host.includes(":")){
    host += ":8080";
  }
  return host;
};

const showCanvas = () => {
  document.querySelectorAll("body > *").forEach(elem => elem.setAttribute("hidden", "hidden"));
  document.querySelector("#game").removeAttribute("hidden");
};

let lastHost;

playBtn.onclick = playAccountBtn.onclick = () => {
  let host = getHost("bomb-game.herokuapp.com:80");
  showCanvas();
  console.log("[socket] connecting to ws://" + host);
  lastHost = host;
  newGame(host);
};

document.querySelector("#respawn-btn").onclick = () => {
  console.log("[socket] connecting to ws://" + lastHost);
  showCanvas();
  newGame(lastHost);
};

const maxShotCooldown = 375;// ms

const newGame = host => {//eslint-disable-line no-unused-vars
  isDead = false;
  socket = new WebSocket("ws://" + host);
  socket.onopen = () => {
    console.log("[socket] connected");
    console.log(token);
    send({type: "hello", data: {token: token}});
  };


  socket.onmessage = (e) => {
    try{
      if(!e.data.trim()) return;
      if(e.data[0] === "!" || e.data[0] === "?"){
        const parsed = parseResponse(e.data);
        players.forEach((player) => {
          let exists = parsed.players.some(player2 => {
            if(player.id === player2.id){
              Object.keys(player2).forEach(prop => {
                player[prop] = player2[prop];
              });
              return true;
            }
          });
          if(!exists){
            players.splice(players.indexOf(player), 1);
          }
        });
        bombs = parsed.bombs;
        return;
      }
      JSON.parse(e.data).forEach(data => {
        try{
          let x;//eslint-disable-line no-unused-vars
          let y;//eslint-disable-line no-unused-vars
          let blocksDestroyed;
          let broken;
          let playerToRemove;
          let killer;
          switch(data.type){
          case "map":
            console.log("got map", data.data);
            blocks = data.data.blocks;
            game(data.data);
            break;
          case "mapReset":
            console.log("got map reset", data.data);
            blocks = data.data.blocks;
            resetTime = undefined;
            document.querySelector("#reset").setAttribute("hidden", "hidden");
            break;
          case "mapResetPending":
            resetTime = data.data.date;
            break;
          case "playerinfo":
            console.log("info about me", data.data);
            myId = data.data.id;
            break;
          case "newUser":
            console.log("newUser", data.data, players);
            if(players.some(player => {
              if(player.id === data.data.id){
                return true;
              }
            })) return;
            players.push(data.data);
            break;
          case "removePlayer":
            players.some(player => {
              if(player.id === data.data){
                playerToRemove = player;
                return true;
              }
            });
            if(!playerToRemove) return;
            players.splice(players.indexOf(playerToRemove), 1);
            break;
          case "kill":
            lastKill = "";
            if(myId === data.data.victim.id){
              console.log("i was killed by ", data.data.killer.username);
              return isDead = true;
            }

            killer = (players.filter(player => player.id === data.data.killer.id) || [])[0];
            if(killer){
              killer.killStreak = data.data.killer.killStreak;
            }
            console.log(data.data);
            lastKill = data.data.killer.username + " killed " + data.data.victim.username;

            lastKillTimeout = 16;
            killAudio.play();
            break;
          case "players":
            players = data.data;
            console.log("got players", JSON.stringify(data));
            break;
          case "explosion":
            x = data.data.x;
            y = data.data.y;
            blocksDestroyed = data.data.blocksDestroyed;
            broken = blocks.filter(block => blocksDestroyed.some(destroyed => destroyed[0] === block[0] && destroyed[1] === block[1]));
            broken.forEach(block => {
              console.log("remove", block);
              const index = blocks.indexOf(block);
              if(index) blocks.splice(index, 1);
            });
            break;
          default:
            throw new Error("Unknown WS protocol type", "\"", data.type, "\"");
          }
        }catch(err){
          console.error("Unexpected error in message processing", err, data);
        }
      });
    }catch(err){
      console.error("Unexpected error in JSON parsing", err, "\"" + e.data + "\"");
    }
  };

  const send = (...data) => {
    if(!socket) return;
    socket.send(JSON.stringify(data));
  };

  const getKeyPressFunc = type => {
    return e => {
      let key = rewrites[e.key.toLowerCase()];

      if(key === "respawn"){//eslint-disable-line no-unused-vars
        if(type === "keyDown") return;
        socket.close();
        showCanvas();
        newGame(lastHost);
      }else if(key){
        send({type: type, data: key});
      }else{
        console.log("unknown key", key, e.key);
      }
    };
  };

  onkeydown = getKeyPressFunc("keyDown");

  onkeyup = getKeyPressFunc("keyUp");


  let lastShot = Date.now();
  onkeypress = e => {
    let now = Date.now();
    if(e.key === " " && now - lastShot > maxShotCooldown){
      lastShot = Date.now();
      shootAudio.play();
      send({type: "bomb"});
    }
  };
};

const decodeQueryStr = str => str.substr(1).split("&").map(query => query.split("=")).reduce((obj, that) => {
  if(!that || !that[0]) return;
  obj[that[0]] = decodeURIComponent(that[1]);
  return obj;
}, {});

firebase.auth().onAuthStateChanged(() => {
  const parsedHash = decodeQueryStr(location.hash);
  if(parsedHash && parsedHash.autoconnect){
    let host = getHost(parsedHash.autoconnect);
    showCanvas();
    console.log("[socket] connecting to ws://" + host);
    lastHost = host;
    newGame(host);
  }
});