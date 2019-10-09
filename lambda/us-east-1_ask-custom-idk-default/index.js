/* eslint-disable no-undef */
//this version of the code is deployed through the ASK CLI
//deployed to the skill named "idk" 
//held by account: team code breakers

const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
require('dotenv').config();

//Location call
const messages = {
    NOTIFY_MISSING_PERMISSIONS: 'Please enable device location permissions in the Amazon Alexa app.',
    NO_ADDRESS: 'It looks like you don\'t have an address set. You can set your address from the companion app.',
    ERROR: 'Uh Oh. Looks like something went wrong.'
  };
  const DEVICE_LOCATION_PERMISSION = 'read::alexa:device:all:address';
  const APP_NAME = "idk";

//name and mobile
const FULL_NAME_PERMISSION = "alexa::profile:name:read";
const MOBILE_PERMISSION = "alexa::profile:mobile_number:read";

//Yelp
const yelp = require('yelp-fusion');
const API_KEY = process.env.YELP_API_KEY;

// Initial handler 
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const { serviceClientFactory, responseBuilder } = handlerInput;
        try {
          const upsServiceClient = serviceClientFactory.getUpsServiceClient();
          const profileName = await upsServiceClient.getProfileName();
          
          const speakOutput = `Hey ${profileName}, Welcome to I Don\'t Know, where I recommend places to eat`;
          const repromptText = 'Sorry, I didn\'t catch that.';
          return handlerInput.responseBuilder
              .speak(speakOutput)
              .withSimpleCard(APP_NAME, speakOutput)
              .reprompt(repromptText)
              .getResponse();
          
        } catch (error) {

            const speakOutput = `Welcome to I Don\'t Know, where I recommend places to eat. Can I get your name?`;
            const repromptText = 'Sorry, I didn\'t catch that.';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .withSimpleCard(APP_NAME, speakOutput)
                .reprompt(repromptText)
                .getResponse();
        }


    }
};

// Accepts User's name 
const SetNameHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetNameIntent';
    },
    // TODO: TESTING PERSISTENCE
    async handle(handlerInput) {
        const name = handlerInput.requestEnvelope.request.intent.slots.name.value;

        // START TEST CODE
        const attributesManager = handlerInput.attributesManager;
        let groupAttribute = {
            "group": name
        };
        attributesManager.setPersistentAttributes(groupAttribute);
        await attributesManager.savePersistentAttributes();
        // END TEST CODE

        const speakOutput = `Hey ${name}, I can recommend a place, create or add you to a group, check your device location, or exit. What would you like?`;
        const repromptText = 'I didn\'t catch that, can you say it again?';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptText)
            .getResponse();
    }
};

//mobile number from profile
const ProfileMobileIntentHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'ProfileMobileIntent';
    },
    async handle(handlerInput) {
      const { serviceClientFactory, responseBuilder } = handlerInput;
      try {
        const upsServiceClient = serviceClientFactory.getUpsServiceClient();
        const profileMobileObject = await upsServiceClient.getProfileMobileNumber();
        if (!profileMobileObject) {
          const errorResponse = `It looks like you don\'t have a mobile number set. You can set your mobile number from the companion app.`
          return responseBuilder
                        .speak(errorResponse)
                        .withSimpleCard(APP_NAME, errorResponse)
                        .getResponse();
        }
        const profileMobile = profileMobileObject.phoneNumber;
        const speechResponse = `Hello your mobile number is, <say-as interpret-as="telephone">${profileMobile}</say-as>`;
        const cardResponse = `Hello your mobile number is, ${profileMobile}`
        return responseBuilder
                        .speak(speechResponse)
                        .withSimpleCard(APP_NAME, cardResponse)
                        .getResponse();
      } catch (error) {
        console.log(JSON.stringify(error));
        if (error.statusCode == 403) {
          return responseBuilder
          .speak(messages.NOTIFY_MISSING_PERMISSIONS)
          .withAskForPermissionsConsentCard([MOBILE_PERMISSION])
          .getResponse();
        }
        console.log(JSON.stringify(error));
        const response = responseBuilder.speak(messages.ERROR).getResponse();
        return response;
      }
    },
}

//name  from profile
const ProfileNameIntentHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'ProfileNameIntent';
    },
    async handle(handlerInput) {
      const { serviceClientFactory, responseBuilder } = handlerInput;
      try {
        const upsServiceClient = serviceClientFactory.getUpsServiceClient();
        const profileName = await upsServiceClient.getProfileName();
        const speechResponse = `Hello, ${profileName}`;
        return responseBuilder
                        .speak(speechResponse)
                        .withSimpleCard(APP_NAME, speechResponse)
                        .getResponse();
      } catch (error) {
        console.log(JSON.stringify(error));
        if (error.statusCode == 403) {
          return responseBuilder
          .speak(messages.NOTIFY_MISSING_PERMISSIONS)
          .withAskForPermissionsConsentCard([FULL_NAME_PERMISSION])
          .getResponse();
        }
        console.log(JSON.stringify(error));
        const response = responseBuilder.speak(messages.ERROR).getResponse();
        return response;
      }
    },
}

// Location handler
const DeviceLocationIntentHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'DeviceLocationIntent';
    },
    async handle(handlerInput) {
      const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;
      try {
        const { deviceId } = requestEnvelope.context.System.device;
        const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
        const address = await deviceAddressServiceClient.getFullAddress(deviceId);
        let response;
        if (address == undefined || (address.addressLine1 === null && address.stateOrRegion === null)) {
          response = responseBuilder.speak(messages.NO_ADDRESS).getResponse();
          return response;
        } else {
          const completeAddress = `${address.addressLine1}, ${address.stateOrRegion}, ${address.postalCode}`;
          const response = `Your complete address is, ${completeAddress}`;
          return handlerInput.responseBuilder
              .speak(response)
              .withSimpleCard(APP_NAME, response)
              .getResponse();
        }
      } catch (error) {
        console.log(JSON.stringify(error));
        if (error.statusCode == 403) {
          return responseBuilder
          .speak(messages.NOTIFY_MISSING_PERMISSIONS)
          .withAskForPermissionsConsentCard([DEVICE_LOCATION_PERMISSION])
          .getResponse();
        }
        console.log(JSON.stringify(error));
        const response = responseBuilder.speak(messages.ERROR).getResponse();
        return response;
      }
    },
  };

// Recommendations Handler
const RecommendationsHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'RecommendationsIntent';
    },
    async handle(handlerInput) {
      const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;
      try {
        const { deviceId } = requestEnvelope.context.System.device;
        const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
        const address = await deviceAddressServiceClient.getFullAddress(deviceId);
        let response;
        if (address == undefined || (address.city === null && address.stateOrRegion === null)) {
          response = responseBuilder.speak(messages.NO_ADDRESS).getResponse();
          return response;
        } else {
          let location = address.city.toLowerCase() + ', ' + address.stateOrRegion.toLowerCase();
          let place = await searcher(location);
          const response = `How about ${place}?`;
          const repromptText = 'Sorry, I didn\'t catch that';
          return handlerInput.responseBuilder
              .speak(response)
              .reprompt(repromptText)
              .withSimpleCard(APP_NAME, response)
              .getResponse();
        }
      } catch (error) {
        console.log(JSON.stringify(error));
        if (error.statusCode == 403) {
          return responseBuilder
          .speak(messages.NOTIFY_MISSING_PERMISSIONS)
          .withAskForPermissionsConsentCard([DEVICE_LOCATION_PERMISSION])
          .getResponse();
        }
        console.log(JSON.stringify(error));
        const response = responseBuilder.speak(messages.ERROR).getResponse();
        return response;
      }
    },
  };

const searcher = (location) => {
    const client = yelp.client(API_KEY);
    const searchRequest = {
        location: location
    };

    return client.search(searchRequest).then(response => {
        let randomNum = randomizer(response.jsonBody.businesses.length - 1);
        const result = response.jsonBody.businesses[randomNum].name;
        return result;
      }).catch(e => {
        console.log(e);
      }
    );
}

const randomizer = max => {
    return Math.floor(Math.random() * max);
}

// Recommendations Response Handler
const RecommendationsYesHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    handle(handlerInput) {
        // TODO: SNS integration (JACK AND MEL)
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
        const speakOutput = 'I can recommend a place, change options, check your device location, or exit. How can I help?';
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
    .withApiClient(new Alexa.DefaultApiClient())
    .withPersistenceAdapter(new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET}))
    .addRequestHandlers(
        LaunchRequestHandler,
        SetNameHandler,
        ProfileMobileIntentHandler,
        ProfileNameIntentHandler,
        DeviceLocationIntentHandler,
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
