'use strict';

let settings = {
	conversation_url: process.env.HUBOT_WATSON_CONVERSATION_URL,
	conversation_username: process.env.HUBOT_WATSON_CONVERSATION_USERNAME,
	conversation_password: process.env.HUBOT_WATSON_CONVERSATION_PASSWORD,
	conversation_workspace_id: process.env.HUBOT_WATSON_CONVERSATION_WORKSPACE_ID
};

settings.conversation_enabled = settings.conversation_username && settings.conversation_password && settings.conversation_workspace_id;

if (!settings.conversation_url) {
	console.warn('HUBOT_WATSON_CONVERSATION_URL not set. Using default URL for the service.');
}

if (!settings.conversation_username) {
	console.warn('HUBOT_WATSON_CONVERSATION_USERNAME not set');
}
if (!settings.conversation_password) {
	console.warn('HUBOT_WATSON_CONVERSATION_PASSWORD not set');
}

if (!settings.conversation_workspace_id) {
	console.warn('HUBOT_WATSON_CONVERSATION_WORKSPACE_ID not set');
}

if (!settings.conversation_username || !settings.conversation_password || !settings.conversation_workspace_id){
	console.warn('Conversation processing has been disabled because Watson Conversation service is not configured.');
}

module.exports = settings;