/* eslint-disable no-undef */
//this version of the code is deployed through the ASK CLI
//deployed to the skill named "idk" 
//held by account: team code breakers

const Alexa = require('ask-sdk-core');
require('dotenv').config();

//trial solution for dynamoDB
const uuidv4 = require('uuid/v4');
const dbHelper = require('./helpers/db-helper.js');

// Yelp
const yelp = require('yelp-fusion');
const API_KEY = process.env.YELP_API_KEY;

const searchRequest = {
    location: 'san francisco, ca'
};

// Initial handler 
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Welcome to I Don\'t Know, where I recommend places to eat. Before we go any further, can I get your name?';
        const repromptText = 'Sorry, I didn\'t catch your name, what is your name?';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptText)
            .getResponse();
    }
};

// Accepts User's name 
const SetNameHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetNameIntent';
    },
    handle(handlerInput) {
        const name = handlerInput.requestEnvelope.request.intent.slots.name.value;
        
        //set name to DB
        dbHelper.addName(name, uuidv4() );

        const speakOutput = `Hey ${name}, I can recommend a place, change your personal options, or exit. What would you like to do?`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// Recommendations Handler
const RecommendationsHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RecommendationsIntent';
    },
    handle(handlerInput) {
        // const recommendation = handlerInput.requestEnvelope.request.intent.slots.recommendation.value;
        let place = '';
        const client = yelp.client(API_KEY);

        client.search(searchRequest).then(response => {
            let resultArr = [];
            resultArr.push(response.jsonBody.businesses);
            resultArr.forEach(item => {
                const prettyJson = JSON.stringify(item[0].name, null, 4);
                place = prettyJson;
                console.log(prettyJson);
            });
            // Original:
            // const firstResult = response.jsonBody.businesses[0].name;
            // const prettyJson = JSON.stringify(firstResult, null, 4);
            // console.log(prettyJson);
          }).catch(e => {
            console.log(e);
          }
        );

        const speakOutput = `How about ${place}`; // change to variable / slot name
        const repromptText = 'Sorry, I didn\'t catch that';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptText)
            .getResponse();
    }
};

// Recommendations Response Handler
const RecommendationsYesHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    handle(handlerInput) {
        // const recommendationResponse = handlerInput.requestEnvelope.request.intent.slots.recommendationResponse.value;
        const speakOutput = `A message is being sent to the people in your group`; // change to variable / slot name
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const RecommendationsNoHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';  
    },
    handle(handlerInput) {
        return RecommendationsHandler.handle(handlerInput);
    }
};


//help
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'I can recommend a place, change options, or exit. How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

//stop
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

//end
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SetNameHandler,
        RecommendationsHandler,
        RecommendationsYesHandler,
        RecommendationsNoHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addErrorHandlers(
        ErrorHandler
    )
    .lambda();
