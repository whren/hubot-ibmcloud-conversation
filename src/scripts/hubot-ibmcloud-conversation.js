'use strict';

var esrever = require('esrever');
var path = require('path');
var fs = require('fs');
var env = require(path.resolve(__dirname, '..', 'lib', 'env'));
//var mqtt = require(path.resolve(__dirname, 'mqtt-common'));
//var Paho = require(path.resolve(__dirname, '..', 'lib', 'mqttws31'));
var request = require('request');

var robot;

var conversationTimeoutCheck = env.conversation_timeout_check || 30000;
var conversationTimeout = env.conversation_timeout || 60000;
// conversations data holder
var conversations = {};

// messages holder
var messages = {};
var messageTimeoutCheck = env.message_timeout_check || 30000;
var messageTimeout = env.message_timeout || 60000;

// Conversations timeout checker
setTimeout(conversationTimeoutChecker, conversationTimeoutCheck);
// Message timeout checker
setTimeout(messageTimeoutChecker, messageTimeoutCheck);

// https://www.ibm.com/watson/developercloud/conversation/api/v1/
var url = env.conversation_url + 
	env.conversation_workspace_id + 
//  '/message?version=2016-07-11';
	'/message?version=2016-09-20';


var conversation;

/*
function readJsonConversationFile() {
	var jsonConversationFilePath = process.env.HUBOT_JSON_FILE_CONVERSATION_PATH || '/var/hubot';
	jsonConversationFilePath = path.join(jsonConversationFilePath, process.env.HUBOT_JSON_FILE_CONVERSATION_NAME || 'conversation.json');
	
	try {
		var data = fs.readFileSync(jsonConversationFilePath, 'utf-8');
		if (data) {
		  conversation = JSON.parse(data);
		  console.log("JSON conversation file read : " + JSON.stringify(conversation));
		}
	} catch (_error) {
		var error = _error;
		if (error.code !== 'ENOENT') {
		  console.log('Unable to read file', error);
		}
	}
}
*/

/**
 * Check conversations for timeout receiving.
 * If any found, remove it.
 * Set another function timeout.
 */
function conversationTimeoutChecker() {
    for (var room in conversations) {
    	for (var user in conversations[room]) {
    		var currentIdle = Date.now() - conversations[room][user].last;

    		if (currentIdle < conversationTimeout && currentIdle >= (conversationTimeout - (conversationTimeout / 4)) && !conversations[room][user].timeoutWarning) {
    			robot.messageRoom(room, (!conversations[room][user].directMessage ? "@" + user + ": " : "") + "Je vous ai perdu... ?");
    			conversations[room][user].timeoutWarning = true;
    		} else if (currentIdle >= conversationTimeout) {
    			// If timeout has been reached
	        	robot.logger.info('>Conversation timeout checker, timed out for ' + room + ' - ' + user);
	        	robot.messageRoom(room, (!conversations[room][user].directMessage ? "@" + user + ": " : "") + "J'ai mis fin à notre conversation, à bientôt");
	            // Remove in memory chunk
	            conversations[room][user] = null;
	            delete conversations[room][user];
	        }
	    }

		if (Object.keys(conversations[room]).length === 0 && conversations[room].constructor === Object) {
	    	robot.logger.info('>Conversation timeout checker, empty conversations for room ' + room);
            conversations[room] = null;
            delete conversations[room];
	    }
    }

    setTimeout(conversationTimeoutChecker, conversationTimeoutCheck);
}

/**
 * Check messages for timeout receiving.
 * If any found, remove it.
 * Set another function timeout.
 */
function messageTimeoutChecker() {
    for (var url in messages) {
		var currentIdle = (Date.now()/1000) - messages[url].ts;

		if (currentIdle >= messageTimeout/1000) {
			// If timeout has been reached
        	robot.logger.info('>Message timeout checker, timed out for ' + url);
            // Remove in memory chunk
            messages[url] = null;
            delete messages[url];
        }
    }

    setTimeout(messageTimeoutChecker, messageTimeoutCheck);
}

/**
 * Gets the first text from an array of potential responses.
 */
function getResponseText(params) {
  for (var i = 0; i < params.length; i++) {
    if (params[i]) return params[i];
  }
  return params;
}

/**
 * Calls the Watson Conversation service with provided request JSON.
 * On response, calls the action function with response from Watson.
 */
function callConversationService(json, action, actionOnError) {
  request({
    auth: {
      username: env.conversation_username,
      password: env.conversation_password
    },
    method: 'post',
    json: true,
    url: url,
      headers: {
        'Content-Type': 'application/json',
    	// https://www.ibm.com/watson/developercloud/conversation/api/v1/#data-collection
    	"x-watson-learning-opt-out": "true"
      }
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {
        action(body);
      } else {
      	actionOnError(error, response, body);
      }
  }).end(json);
}

/**
 * Strips the bot name from the given statement.
 */
function stripBotName(botName, text) {
	var nameToken = new RegExp('(^|\\s)@?' + botName + ':?\\s', 'g');
	return text.replace(nameToken, ' ').trim();
}

/**
 * Checks to see if the bot has been addressed in a message.
 */
function checkBotNameInMessage(botName, text) {
	var lookBehindCheck = false;
	var lookAheadCheck = false;

	var modifiedBotName = botName;
	if (isSlack() || isRocketChat()) {
		modifiedBotName = "@" + botName;
	}

	var reversedBotName = esrever.reverse(modifiedBotName);

	var lookAheadRegExp = new RegExp('(' + modifiedBotName + ')(?\!\\w)');
	var lookBehindRegExp = new RegExp('(' + reversedBotName + ')(?\!\\w)');

	lookAheadCheck = text.match(lookAheadRegExp) !== null;
	lookBehindCheck = esrever.reverse(text).match(lookBehindRegExp) !== null;

	return lookBehindCheck && lookAheadCheck;
}

/**
 * true if we are certain the robot is running in slack, else false.
 */
function isSlack() {
	return (robot.adapterName && robot.adapterName.toLowerCase().indexOf('slack') > -1);
}

/**
 * true if we are certain the robot is running in rocket.chat, else false.
 */
function isRocketChat() {
	return (robot.adapterName && robot.adapterName.toLowerCase() === 'rocketchat');
}

/**
 * true if we are certain the robot is running in slack, else false.
 */
function isFacebook() {
	return (robot.adapterName && robot.adapterName.toLowerCase() === 'fb');
}

/**
 * Checks to see if the conversation is happening in a direct message.
 */
function isDirectMessage(res) {
	var directMessage = false;

	if (isFacebook() || isSlack()) {
		robot.logger.debug('>Conversation is Slack or FB');
		directMessage = res.message.room[0] === 'D';
	} else if (isRocketChat()) {
		robot.logger.debug('>Conversation is Rocket.Chat');
		directMessage = res.robot.adapter.chatdriver.asteroid.collections["stream-room-messages"]._set._items.id.args[1].roomType === 'd';
	} else {
		robot.logger.warn('>Conversation no direct message adapter match');
	}

	return directMessage;
}

/**
 * Checks to see if the message came from a bot
 */
function isMessageFromBot(res) {
	return res.message.user.name === 'hubot' || res.message.user.is_bot;
}

/**
 * Process upon error
 */
function onError(error, resp, body) {
	//robot.logger.warn('>Conversation error : ' + error + ", response : " + resp + ", body : " + body);
}

/**
 * Check nested object property existence
 */
function checkNested(obj /*, level1, level2, ... levelN*/) {
  var args = Array.prototype.slice.call(arguments, 1);

  for (var i = 0; i < args.length; i++) {
    if (!obj || !obj.hasOwnProperty(args[i])) {
      return false;
    }
    obj = obj[args[i]];
  }
  return true;
}


function generateChannelName(projectName) {
	if (projectName && projectName !== "") {
		return "#" + projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().substring(0, 21);
	}

	return null;
}

//var orig_onSuccess = mqtt.onSuccess;

/**
 * Called on broker connection successfull.
 */
//mqtt.onSuccess = function() {
//	orig_onSuccess.call(this);
//
//	robot.logger.info('Connection mqtt OK');
//
//	mqtt.subscribeToTopics("lisa/status", 0, false);
//};

//mqtt.onMessageArrived = function(message) {
//	robot.messageRoom("#lsdemo", "> Message arrived (" + message.destinationName + ") : " + message.payloadString);
//	//robot.logger.debug("> Message arrived (" + message.destinationName + ") : " + message.payloadString);
//};

// ----------------------------------------------------
// Start of the HUBOT interactions.
// ----------------------------------------------------
module.exports = function(robotAdapter) {
	robot = robotAdapter;
	var botName = robot.name;

	robot.logger.debug('>Conversation enable ? ' + env.conversation_enabled);

	if (env.conversation_enabled) {
		robot.logger.info('>Conversation is enabled with botName : ' + botName);

//		var Promise, idsPromise, request;

//		request = require('request');

//		Promise = require('promise').Promise;

//		idsPromise = new Promise(function(resolve, reject) {
//		  return request('https://slack.com/api/channels.list?token=' + process.env.HUBOT_SLACK_TOKEN, function(error, response, body) {
//		    var channel, i, json, len, name2id, ref;
//		    name2id = {};
//		    if (!error && response.statusCode === 200) {
//		      json = JSON.parse(body);
//		      ref = json.channels;
//		      for (i = 0, len = ref.length; i < len; i++) {
//		        channel = ref[i];
//		        name2id['#' + channel.name] = channel.id;
//		      }
//		    }
//		    return resolve(name2id);
//		  });
//		});

//		robot.messageRoom = function(roomNameOrId, txt) {
//		  return idsPromise.then(function(name2id) {
//		    if (roomNameOrId[0] === '#') {
//		      return robot.send({
//		        room: name2id[roomNameOrId]
//		      }, txt);
//		    } else {
//		      return robot.send({
//		        room: roomNameOrId
//		      }, txt);
//		    }
//		  });
//		};

		// Read json conversation file
//		readJsonConversationFile();

//		var willMsg = {};

//        if (process.env.MQTT_CLI_WILL_MSG_PUBLISH_TOPIC && process.env.MQTT_CLI_WILL_MSG_PUBLISH_QOS && process.env.MQTT_CLI_WILL_MSG_PUBLISH_RETAINED) {
//			var willMsg = new Paho.MQTT.Message(botName + " est parti...");
//			willMsg.destinationName = process.env.MQTT_CLI_WILL_MSG_PUBLISH_TOPIC;
//			willMsg.qos = Number(process.env.MQTT_CLI_WILL_MSG_PUBLISH_QOS) || 0;
//			willMsg.retained = (process.env.MQTT_CLI_WILL_MSG_PUBLISH_RETAINED === 'true');
//	    }

//		mqtt.configureMQTTConnection(
//        	process.env.MQTT_HOST,
//        	Number(process.env.MQTT_PORT || '443'),
//        	process.env.MQTT_CONTEXT,
//        	process.env.MQTT_CLI_ID,
//        	willMsg,
//        	Number(process.env.MQTT_CONNECT_TIMEOUT) || 30000,
//        	Number(process.env.MQTT_KEEPALIVE) || 10,
//        	true,
//        	process.env.MQTT_USERNAME,
//	        process.env.MQTT_PASSWORD,
//	        (process.env.MQTT_CLI_CLEAN === 'true')      
//	    );

//	    robot.logger.debug("Connecting with configuration : " + JSON.stringify(mqtt.clientConfiguration));
//	    mqtt.mqttConnect();

//		robot.on('reload_scripts', function() {
//			mqtt.mqttDisconnect();
//		});

//		robot.on('reload_scripts_hubot-scripts', function() {
//			mqtt.mqttDisconnect();
//		});

//		robot.on('reload_scripts_hubot-external-scripts', function() {
//			mqtt.mqttDisconnect();
//		});


/*
		# hubot brain runs on events
  		robot.brain.emit 'save'

  		robot.brain.on('loaded', function() {
			robot.brain.lastAccessed = new Date()
			robot.brain.seagulls = 12
			robot.brain.flowers = { pansies: true, daffodils: false }
  		});
*/

		robot.on('mqtt:onSuccess', function() {
			robot.emit('mqtt:sub', null, "hubot-ibmcloud-conversation", process.env.HUBOT_ADOP_NOTIFICATION_SUBSCRIBE_TOPIC);
			robot.on('mqtt:onMessage:hubot-ibmcloud-conversation', function(message) {
//				console.log("Receiving event");
				var jsonMessage;

				try {
					jsonMessage = JSON.parse(message.payloadString);
				} catch (error) {}

				if (jsonMessage) {
					var ts = Date.now()/1000;
					var existing = false;

					if (!messages[jsonMessage.full_url]) {
						messages[jsonMessage.full_url] = {
							ts: ts
						};
					} else {
						existing = true;
					}

					robot.logger.debug("Notification for jsonMessage.full_url : " + JSON.stringify(messages[jsonMessage.full_url]) + (existing ? " (existing)" : ""));

					var channelName = generateChannelName(jsonMessage.projectName);

					// Ensure bot is in the channel
					var reqbody = {
						token: process.env.HUBOT_SLACK_USER_TOKEN,
						name: encodeURIComponent(channelName)
					};

					reqbody = JSON.stringify(reqbody);

					robot.logger.debug("Request body for channels.join : " + reqbody);

					robot.http("https://slack.com/api/channels.join?token=process.env.HUBOT_SLACK_USER_TOKEN&name=" + encodeURIComponent(channelName))
						.header("Content-Type", "application/json")
						.post(JSON.stringify({}))(function(err, res, body) {
					  if (res.statusCode === 200) {
					  	robot.logger.debug("Response body of channels.join : " + body);
					    return;
					  }
					  return robot.logger.error("Error!", res.statusCode, body);
					});

					robot.adapter.client.web.channels.join(channelName, function (err, res) {
						if (err) {
							robot.logger.error("Error occurs joining channel : " + err);
						} else {
							if (!res.ok) {
								robot.logger.error("Joining channel error result : " + res.error);
							} else {
								if (res.already_in_channel) {
									robot.logger.debug("Bot is already in the channel : " + res.channel.name);
								} else {
									robot.logger.debug("Bot has joined the channel : " + res.channel.name);
								}

								var attachments = {
								    attachments: [
								        {
								            fallback: "Projet <" + jsonMessage.project_url + "|" + jsonMessage.projectName + "> : <" +  jsonMessage.full_url + "|" + jsonMessage.jobName + "> est " + jsonMessage.statut + (jsonMessage.buildStatus === 'FAILURE' ? " en échec" : (jsonMessage.buildStatus === 'SUCCESS' ? " avec succès" : "")),
								            mrkdwn_in: [
								                "text",
								                "title"
								            ],
								            color: (jsonMessage.buildStatus === 'FAILURE' ? "danger" : (jsonMessage.buildStatus === 'SUCCESS' ? "good" : "#439FE0")),
								            title: (jsonMessage.buildStatus === 'FAILURE' ? ":x:" : (jsonMessage.buildStatus === 'SUCCESS' ? ":white_check_mark:" : ":arrow_forward:")) + " Projet <" + jsonMessage.project_url + "|" + jsonMessage.projectName + "> - Job <" + jsonMessage.jenkins_url + jsonMessage.url + "|" + jsonMessage.jobName + "> - Build <" + jsonMessage.full_url + "|#" + jsonMessage.buildNumber + ">",
								            text: "Job " + jsonMessage.statut + (jsonMessage.buildStatus === 'FAILURE' ? " en échec" : (jsonMessage.buildStatus === 'SUCCESS' ? " avec succès" : "")) + " [<" + jsonMessage.full_url + "console" + "|Console>]",
								            //title_link: jsonMessage.full_url,
								            footer: "<" + jsonMessage.jenkins_url + "|Jenkins>",
								            footer_icon: "https://jenkins.io/images/226px-Jenkins_logo.svg.png",
								            ts: ts
								        }
								    ],
								    as_user: true
								};

								if (existing) {
									robot.logger.debug("Request message update for " + jsonMessage.full_url);
									robot.adapter.client.web.chat.update(
										messages[jsonMessage.full_url].ts,
										res.channel.id,
										"",
										{
											attachments: [
										        {
										            fallback: "Projet <" + jsonMessage.project_url + "|" + jsonMessage.projectName + "> : <" +  jsonMessage.full_url + "|" + jsonMessage.jobName + "> est " + jsonMessage.statut + (jsonMessage.buildStatus === 'FAILURE' ? " en échec" : (jsonMessage.buildStatus === 'SUCCESS' ? " avec succès" : "")),
										            mrkdwn_in: [
										                "text",
										                "title"
										            ],
										            color: (jsonMessage.buildStatus === 'FAILURE' ? "danger" : (jsonMessage.buildStatus === 'SUCCESS' ? "good" : "#439FE0")),
										            title: (jsonMessage.buildStatus === 'FAILURE' ? ":x:" : (jsonMessage.buildStatus === 'SUCCESS' ? ":white_check_mark:" : ":arrow_forward:")) + " Projet <" + jsonMessage.project_url + "|" + jsonMessage.projectName + "> - Job <" + jsonMessage.jenkins_url + jsonMessage.url + "|" + jsonMessage.jobName + "> - Build <" + jsonMessage.full_url + "|#" + jsonMessage.buildNumber + ">",
										            text: "Job " + jsonMessage.statut + (jsonMessage.buildStatus === 'FAILURE' ? " en échec" : (jsonMessage.buildStatus === 'SUCCESS' ? " avec succès" : "")) + " [<" + jsonMessage.full_url + "console" + "|Console>]",
										            //title_link: jsonMessage.full_url,
										            footer: "<" + jsonMessage.jenkins_url + "|Jenkins>",
										            footer_icon: "https://jenkins.io/images/226px-Jenkins_logo.svg.png",
										            ts: ts
										        }
										    ],
										    as_user: true
										},
										function(err, res) {
											if (err) {
												robot.logger.error("Error occurs editing message : " + err);
											} else {
												if (!res.ok) {
													robot.logger.error("Editing message error result : " + res.error);
												} else {
													messages[jsonMessage.full_url].ts = res.ts;
													robot.logger.debug("Attachment " + messages[jsonMessage.full_url].ts + " edited with success ! (" + res.ts + ")");
												}
											}
										}
									);									
								} else {
								    attachments.token = process.env.HUBOT_SLACK_TOKEN;
								    attachments.channel = channelName;
								    attachments.text = "";


									robot.adapter.client.web.chat.postMessage(
										channelName,
										"",
										attachments,
										function(err, res) {
											if (err) {
												robot.logger.error("Error occurs posting message : " + err);
											} else {
												if (!res.ok) {
													robot.logger.error("Posting message error result : " + res.error);
												} else {
													messages[jsonMessage.full_url].ts = res.ts;
													robot.logger.debug("Attachment " + res.ts + " posted with success ! (" + res + ")");
												}
											}
										}
									);
								}
							}
						}
					});
				} else {
	//				robot.messageRoom(process.env.HUBOT_ADOP_NOTIFICATION_CHANNEL, "> [" + message.destinationName + "] " + message.payloadString);
					robot.messageRoom(process.env.HUBOT_ADOP_NOTIFICATION_CHANNEL, "> [" + message.destinationName + "] " + message.payloadString);
				}
			});
		});


		var cmd_char = process.env.HUBOT_COMMAND_CHAR || "\!";
//		var bot_name_array = botName.split("");
//		for ( i = 0; i < bot_name_array.length; i++) {
//		    bot_name_array[i] = "[^" + bot_name_array[i] + "]";
//		}
//		var bot_name_regx = bot_name_array.join("");
		// Match everything that starts with botname and without the command char
  		var regx = new RegExp("^@?" + botName + "\\s+[^" + cmd_char + "].*");
		robot.hear(regx, {
			id: 'hubot-ibmcloud-conversation.hubot-ibmcloud-conversation'
		}, function(res) {
			if ((res.message.user.name && res.message.user.id) || res.message.user.is_bot) {
				robot.logger.debug('>Conversation msg received : ' + res.message.text);
				robot.logger.debug('>Conversation from : ' + res.message.user.name + " (id : " + res.message.user.id + ") | isBot " + res.message.user.is_bot);
				robot.logger.debug('>Conversation on : ' + res.message.room[0]);
				robot.logger.debug('>Conversation adapterName : ' + robot.adapterName);
				if (isRocketChat()) {
					robot.logger.debug('>Conversation room type : ' + res.robot.adapter.chatdriver.asteroid.collections["stream-room-messages"]._set._items.id.args[1].roomType);
				}
				robot.logger.debug('>Conversation res methods : ' + Object.getOwnPropertyNames(res).filter(function (p) {
				    return typeof Math[p] === 'function';
				}));

				// ignore other bots
				if (isMessageFromBot(res)) {
					return;
				}
				var directMessage = isDirectMessage(res);
				var botAddressedInMessage = checkBotNameInMessage(botName, res.message.text);

				robot.logger.debug('>Conversation direct message : ' + directMessage);
				robot.logger.debug('>Conversation botAddressedInMessage : ' + botAddressedInMessage);
				// Respond only when the bot is addressed in a public room or if it's a private message
				if (directMessage || botAddressedInMessage) {
					// Remove the bot name from the bot statement
					var text = stripBotName(botName, res.message.text).trim();
					robot.logger.debug('>Conversation text without name of the bot : ' + text);
					// make sure we have more than one word in the text
					robot.logger.info('>Conversation Call to conversation service');
					var room = res.message.room;
					var user = res.message.user.name;

				    if (!checkNested(conversations, room)) {
				    	conversations[room] = {};
				    }

				    if (checkNested(conversations, room, user)) {
						robot.logger.debug('>Conversation Existing conversation : ' + room + ' - ' + user);
						var lisaContext = {
							devops: false,
							appName: "",
							appType: "",
							appStatus: "",
							endFlow: false
						};
						if (conversations[room][user].resp.context.lisaContext) {
							lisaContext.devops = conversations[room][user].resp.context.lisaContext.devops;
							lisaContext.appName = conversations[room][user].resp.context.lisaContext.appName;
							lisaContext.appType = conversations[room][user].resp.context.lisaContext.appType;
							lisaContext.appStatus = conversations[room][user].resp.context.lisaContext.appStatus;
							lisaContext.endFlow = conversations[room][user].resp.context.lisaContext.endFlow;
						} else {
							lisaContext = undefined;
						}

						var req_json = '{\"input\":{\"text\":\"' + 
							text + 
							'\"},\"context\":{\"conversation_id\":\"' + 
							conversations[room][user].resp.context.conversation_id + 
							'\",\"system\":{\"dialog_stack\":' +
							JSON.stringify(conversations[room][user].resp.context.system.dialog_stack) +
							',\"dialog_turn_counter\": ' +
							conversations[room][user].resp.context.system.dialog_turn_counter +
							',\"dialog_request_counter\": ' +
							conversations[room][user].resp.context.system.dialog_request_counter +
							'}' +
	//						(lisaContext.length > 0 ? ',' + lisaContext : '') +
							(lisaContext ? ',\"lisaContext\":' + JSON.stringify(lisaContext) : '') +
							'}' +
							', \"entities\":' +
							JSON.stringify(conversations[room][user].resp.entities) +
	//						', \"intents\":' +
	//						JSON.stringify(conversations[room][user].resp.intents) +
							'}';
						robot.logger.debug('>Conversation req_json : ' + req_json);
						callConversationService(req_json, function (resp) {
							robot.logger.debug('>Conversation conv id : ' + conversations[room][user].resp.context.conversation_id + ', response text : ' + resp.output.text);
							var cache = [];
							robot.logger.debug('>Conversation resp : ' + JSON.stringify(resp, function(key, value) {
							    if (typeof value === 'object' && value !== null) {
							        if (cache.indexOf(value) !== -1) {
							            // Circular reference found, discard key
							            return;
							        }
							        // Store value in our collection
							        cache.push(value);
							    }
							    return value;
							}));
							cache = null; // Enable garbage collection
							var txt = getResponseText(resp.output.text);
							if (txt.length > 0) {
	//							if (directMessage) {
									res.reply(txt);

	//								mqtt.publishMessage(
	//						        	process.env.MQTT_CLI_MSG_PUBLISH_TOPIC,
	//					        		txt,
	//					        		Number(process.env.MQTT_CLI_MSG_PUBLISH_QOS) || 0,
	//					        		(process.env.MQTT_CLI_MSG_PUBLISH_RETAINED === 'true')
	//					        	);

	//							} else {
	//								robot.messageRoom(room, txt);
	//							}
							}
							conversations[room][user].resp = resp;
							conversations[room][user].last = Date.now();
							conversations[room][user].timeoutWarning = false;

							if (conversations[room][user].resp.context.lisaContext && conversations[room][user].resp.context.lisaContext.endFlow) {
								// Fin du flow demandee
								// Traitement des parametres
								var lisaContext = conversations[room][user].resp.context.lisaContext;
								
								if (lisaContext.appType === "web" && lisaContext.appStatus === "new" && lisaContext.devops && lisaContext.appName) {
									res.reply("Requesting project " + lisaContext.appName + " creation...");

									var payload = {
									    method:"POST",
									    url: process.env.HUBOT_ADOP_URL 
											+ process.env.HUBOT_WATSON_CONVERSATION_JENKINS_PROJECT_CREATION_URL + lisaContext.appName,
									    credential: process.env.HUBOT_ADOP_USERNAME + ":" + process.env.HUBOT_ADOP_PASSWORD,
									    headers: {
									      "Content-Type":"application/json"
									    }
									  };

									// Call to node-red api jenkins to create project
									//robot.emit('mqtt:pub', msg, "lisa/status", "{button:" + video + ",value:1}");
									robot.emit('adop:query', 
										res,
										process.env.HUBOT_NODE_RED_ENDPOINT_URL,
										null,
										JSON.stringify(payload),
										function(err, res, body) {
											if (body) {
												res.reply("Done !");

	//											res.reply("Requesting source generation...");
											}
										}
									);

									// Remove conversation flow
									conversations[room][user] = null;
								    delete conversations[room][user];
								}
							}
						}, onError);
					} else {
						robot.logger.debug('>Conversation New conversation : ' + room + ' - ' + user);
					    callConversationService('{}', function (resp) {
					    	var cache = [];
							robot.logger.debug('>Conversation resp : ' + JSON.stringify(resp, function(key, value) {
							    if (typeof value === 'object' && value !== null) {
							        if (cache.indexOf(value) !== -1) {
							            // Circular reference found, discard key
							            return;
							        }
							        // Store value in our collection
							        cache.push(value);
							    }
							    return value;
							}));
							cache = null; // Enable garbage collection
							var txt = getResponseText(resp.output.text);
							if (txt.length > 0) {
	//							if (directMessage) {
									res.reply(txt);

	//								mqtt.publishMessage(
	//						        	process.env.MQTT_CLI_MSG_PUBLISH_TOPIC,
	//					        		txt,
	//					        		Number(process.env.MQTT_CLI_MSG_PUBLISH_QOS) || 0,
	//					        		(process.env.MQTT_CLI_MSG_PUBLISH_RETAINED === 'true')
	//					        	);

	//							} else {
	//								robot.messageRoom(room, txt);
	//							}
							}
							conversations[room][user] = {"directMessage": isDirectMessage(res), "resp": resp, "timeoutWarning": false, "last": Date.now()};
							var req_json = '{\"input\":{\"text\":\"' + 
								text + 
								'\"},\"context\":{\"conversation_id\":\"' + 
								conversations[room][user].resp.context.conversation_id + 
								'\",\"system\":{\"dialog_stack\":[\"root\"],\"dialog_turn_counter\": ' +
								conversations[room][user].resp.context.system.dialog_turn_counter +
								',\"dialog_request_counter\": ' +
								conversations[room][user].resp.context.system.dialog_request_counter +
								'}}}';
							    
							callConversationService(req_json, function (resp2) {
								robot.logger.debug('>Conversation conv id : ' + conversations[room][user].resp.context.conversation_id + ', response text : ' + resp2.output.text);
								var cache = [];
								robot.logger.debug('>Conversation resp : ' + JSON.stringify(resp2, function(key, value) {
								    if (typeof value === 'object' && value !== null) {
								        if (cache.indexOf(value) !== -1) {
								            // Circular reference found, discard key
								            return;
								        }
								        // Store value in our collection
								        cache.push(value);
								    }
								    return value;
								}));
								cache = null; // Enable garbage collection
								var txt = getResponseText(resp2.output.text);
								if (txt.length > 0) {
	//								if (directMessage) {
										res.reply(txt);

	//									mqtt.publishMessage(
	//							        	process.env.MQTT_CLI_MSG_PUBLISH_TOPIC,
	//						        		txt,
	//						        		Number(process.env.MQTT_CLI_MSG_PUBLISH_QOS) || 0,
	//						        		(process.env.MQTT_CLI_MSG_PUBLISH_RETAINED === 'true')
	//						        	);

	//								} else {
	//									robot.messageRoom(room, txt);
	//								}
								}
								conversations[room][user].directMessage = isDirectMessage(res);
								conversations[room][user].resp = resp2;
								conversations[room][user].last = Date.now();
								conversations[room][user].timeoutWarning = false;
							}, onError);
					  	}, onError);
					}
				}
			}
		});
	}
};

