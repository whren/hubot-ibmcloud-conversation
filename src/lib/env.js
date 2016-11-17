'use strict';

var settings = {
	conversation_url: process.env.HUBOT_WATSON_CONVERSATION_URL,
	conversation_username: process.env.HUBOT_WATSON_CONVERSATION_USERNAME,
	conversation_password: process.env.HUBOT_WATSON_CONVERSATION_PASSWORD,
	conversation_workspace_id: process.env.HUBOT_WATSON_CONVERSATION_WORKSPACE_ID,
	conversation_timeout_check: process.env.HUBOT_WATSON_CONVERSATION_TIMEOUT_CHECK,
	conversation_timeout: process.env.HUBOT_WATSON_CONVERSATION_TIMEOUT,

/*
	mqtt_cli_will_msg_publish_topic: ,
	mqtt_cli_will_msg_publish_qos: ,
	mqtt_cli_will_msg_publish_retained: ,
	mqtt_cli_msg_publish_topic: ,
	mqtt_cli_msg_publish_qos: ,
	mqtt_cli_msg_publish_retained: ,
	mqtt_broker_host: ,
	mqtt_broker_port: ,
	mqtt_host_context: ,
	mqtt_connect_timeout: ,
	mqtt_keep_alive_interval: ,
	mqtt_use_ssl: ,
	mosquitto_username: ,
	mosquitto_password: ,
	mqtt_cli_clean_session: 
*/
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

if (!settings.conversation_enabled){
	console.warn('Conversation processing has been disabled because Watson Conversation service is not configured.');
}

module.exports = settings;