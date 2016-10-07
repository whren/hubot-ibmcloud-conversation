const esrever = require('esrever');
const path = require('path');
const env = require(path.resolve(__dirname, '..', 'lib', 'env'));
const request = require('request');


var url = 
  env.conversation_url + 
  env.conversation_workspace_id + 
  '/message?version=2016-07-11';

// Gets the first text from an array of potential responses.
function getResponseText(params) {
  for (i = 0; i < params.length; i++) {
    if (params[i]) return params[i];
  }
  return "";
}

// Calls the Watson Conversation service with provided request JSON.
// On response, calls the action function with response from Watson.
function callConversationService(json, action) {
  request({
    auth: {
      username: env.conversation_username,
      password: env.conversation_password
    },
    method: 'post',
    json: true,
    url: url,
      headers: {
        'Content-Type': 'application/json'
      }
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {
        action(body);
      }
  }).end(json);
}

/**
 * Strips the bot name from the given statement.
 */
function stripBotName(botName, text) {
	let nameToken = new RegExp('(^|\\s)@?' + botName + ':?\\s', 'g');
	return text.replace(nameToken, ' ').trim();
}

/**
 * Checks to see if the bot has been addressed in a message.
 */
function checkBotNameInMessage(botName, text, robot) {
	let lookBehindCheck = false;
	let lookAheadCheck = false;

	let modifiedBotName = botName;
	if (utils.isSlack(robot)) {
		modifiedBotName = `@${botName}`;
	}
	let reversedBotName = esrever.reverse(modifiedBotName);

	let lookAheadRegExp = new RegExp(`(${modifiedBotName})(?\!\\w)`);
	let lookBehindRegExp = new RegExp(`(${reversedBotName})(?\!\\w)`);

	lookAheadCheck = text.match(lookAheadRegExp) !== null;
	lookBehindCheck = esrever.reverse(text).match(lookBehindRegExp) !== null;

	return lookBehindCheck && lookAheadCheck;
}

/*
 * true if we are certain the robot is running in slack, else false.
 */
function isSlack(robot) {
	return (robot && robot.adapterName && robot.adapterName.toLowerCase().indexOf('slack') > -1);
},

/*
 * true if we are certain the robot is running in slack, else false.
 */
function isFacebook(robot) {
	return (robot && robot.adapterName && robot.adapterName.toLowerCase() === 'fb');
}

/**
 * Checks to see if the conversation is happening in a direct message.
 */
function isDirectMessage(res) {
	return res.message.room[0] === 'D';
}

/**
 * Checks to see if the message came from a bot
 */
function isMessageFromBot(res) {
	return res.message.user.name === 'hubot' || res.message.user.is_bot;
}

// ----------------------------------------------------
// Start of the HUBOT interactions.
// ----------------------------------------------------
module.exports = function(robot) {
	let botName = robot.name;

	robot.catchAll((res) => {
		if (env.conversation_enabled) {
			// ignore other bots
			if (isMessageFromBot(res)) {
				return;
			}
			let directMessage = isDirectMessage(res);
			let botAddressedInMessage = checkBotNameInMessage(botName, res.message.text, robot);

			// Respond only when the bot is addressed in a public room or if it's a private message
			if (directMessage || botAddressedInMessage) {
				// Remove the bot name from the bot statement
				let text = stripBotName(botName, res.message.text).trim();
				// make sure we have more than one word in the text
				if (text.split(' ').length > 1) {
				    callConversationService('{}', function (resp) {
						var conv_id = resp.context.conversation_id;
						var req_json = '{\"input\":{\"text\":\"' + 
							text + 
							'\"},\"context\":{\"conversation_id\":\"' + 
							conv_id + 
							'\",\"system\":{\"dialog_stack\":[\"root\"],\"dialog_turn_counter\": 1,\"dialog_request_counter\": 1}}}';
						    
						callConversationService(req_json, function (resp2) {
							var txt = getResponseText(resp2.output.text);
							robot.send(txt);
						});
				  	});

	/**
					processNLC(robot, text).then((result) => {
						robot.emit('ibmcloud-nlc-to-audit', res);
						robot.emit(result.target, res, result.parameters);
					},
					(reject) => {
						if (reject.status === 'Training') {
							robot.logger.info(`${TAG}: Unable to use Natural Language. ${reject.status_description}`);
							robot.emit('ibmcloud.formatter', {response: res, message: reject.status_description});
							robot.emit('ibmcloud.formatter', {response: res, message: i18n.__('nlc.error.unexpected.general')});
						}
						else {
							throw reject;
						}
					}).catch((error) => {
						robot.logger.error(`${TAG}: Error occurred trying to classify statement using NLC; statement = ${text}; error = ${error.error}.`);
						robot.emit('ibmcloud.formatter', {response: res, message: i18n.__('nlc.error.unexpected.general')});
					});
	**/
				}
			}
		}
	});

/**
	robot.on('nlc.help', (res) => {
		robot.emit('ibmcloud.formatter', {response: res, message: i18n.__('nlc.help')});
	});
**/
};

// Register to listen for any user communication with bot.
/**
controller.hears(
  '(.*)',
  ['direct_message'],
  function(bot, message) {      
    callConversationService('{}', function (resp) {
      
      var conv_id = resp.context.conversation_id;
      
      var req_json = 
        '{\"input\":{\"text\":\"' + 
        message.match[1] + 
        '\"},\"context\":{\"conversation_id\":\"' + 
        conv_id + 
        '\",\"system\":{\"dialog_stack\":[\"root\"],\"dialog_turn_counter\": 1,\"dialog_request_counter\": 1}}}';
            
      callConversationService(req_json, function (resp2) {
        
        var txt = getResponseText(resp2.output.text);
        bot.reply(message, txt);
      });
  });
});
**/