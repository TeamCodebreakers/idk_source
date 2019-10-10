/* eslint-disable no-undef */
//this version of the code is deployed through the ASK CLI
//deployed to the skill named "idk"
//held by account: team code breakers

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
require('dotenv').config();

//Location call
const messages = {
  NOTIFY_MISSING_PERMISSIONS:
    'Please enable device location permissions in the Amazon Alexa app.',
  NO_ADDRESS:
    "It looks like you don't have an address set. You can set your address from the companion app.",
  ERROR: 'Uh Oh. Looks like something went wrong.'
};
const DEVICE_LOCATION_PERMISSION = 'read::alexa:device:all:address';
const APP_NAME = 'idk';

//name and mobile
const FULL_NAME_PERMISSION = 'alexa::profile:name:read';
const MOBILE_PERMISSION = 'alexa::profile:mobile_number:read';

//SNS ARN
let SNSArn = '';

//Yelp
const yelp = require('yelp-fusion');
const API_KEY = process.env.YELP_API_KEY;
let resultName;
let resultUrl;

// Initial handler
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const { serviceClientFactory, responseBuilder } = handlerInput;
    try {
      const upsServiceClient = serviceClientFactory.getUpsServiceClient();
      const profileName = await upsServiceClient.getProfileName();
      const profileMobileObject = await upsServiceClient.getProfileMobileNumber();
      let profileMobile = profileMobileObject.phoneNumber;

      const attributesManager = handlerInput.attributesManager;
      const sessionAttributes = attributesManager.getSessionAttributes() || {};
      const group = sessionAttributes.hasOwnProperty('group') ? sessionAttributes.group : 0;
      const snsArn = sessionAttributes.hasOwnProperty('snsarn') ? sessionAttributes.snsarn : 0;
      const members = sessionAttributes.hasOwnProperty('members') ? sessionAttributes.members : 0;

      let speakOutput;

      console.log('Group:', group);
      console.log('Arn:', snsArn);
      console.log('Members:', members);
      
      if (group) {
        speakOutput = `Welcome back, ${profileName}, can I recommend a place, add a member to your group, check your location, or exit?`;
      } else {
        //   Creates SNS Topic
        let createTopicPromise = new AWS.SNS()
          .createTopic({ Name: profileName })
          .promise();

        // Handle promise's fulfilled/rejected states
        createTopicPromise
          .then(function(data) {
            SNSArn = data.TopicArn;
            console.log('Topic ARN is ' + SNSArn);
            return subscribe(SNSArn, profileMobile);
          })
          .then(() => {
            return setInitialGroup(handlerInput, profileName, profileMobile, SNSArn);
          })
          .catch(function(err) {
            console.error(err, err.stack);
          });

        //   Creates the group in s3
        speakOutput = `Hey ${profileName}, welcome to I Don\'t Know, I can recommend a place, add a member to your group, check your location, or exit. What would you like?`;
      }
      
      const repromptText = "Sorry, I didn't catch that.";

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withSimpleCard(APP_NAME, speakOutput)
        .reprompt(repromptText)
        .getResponse();
    } catch (error) {
      console.log('ERROR: ', error);
      const speakOutput = `Welcome to I Don\'t Know, where I recommend places to eat. Can I get your name?`;
      const repromptText = "Sorry, I didn't catch that.";
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withSimpleCard(APP_NAME, speakOutput)
        .reprompt(repromptText)
        .getResponse();
    }
  }
};

// Subscribe to the SNS
const subscribe = (snsArn, phoneNumber) => {
  const sns = new AWS.SNS();
    profileMobile = '+1' + phoneNumber;
    console.log('WE ARE SUBSCRIBING: ', phoneNumber);
    const params = {
      Protocol: 'sms',
      TopicArn: snsArn,
      Endpoint: profileMobile,
      ReturnSubscriptionArn: true || false
    };
    sns.subscribe(params, function(err, data) {
      if (err) {
        console.log('ERR: ', err);
      } else {
        console.log('DATA: ', data);
      }
    });
    console.log('SUBSCRIBED!');
};

//Sets the initial group for s3
const setInitialGroup = (handlerInput, name, phoneNumber, snsArn) => {
  console.log('SNS ARN:', snsArn);
  const attributesManager = handlerInput.attributesManager;
  let groupAttribute = {
      "group": name,
      "snsarn": snsArn,
      "members": [
        {
          "name": name,
          "phoneNumber": phoneNumber
        }
      ]
  };
  console.log("Group Attribute:", groupAttribute);
  attributesManager.setPersistentAttributes(groupAttribute);
  attributesManager.savePersistentAttributes();
};

//Updates the group with new members
const addMemberToGroup = (handlerInput, name, phoneNumber, group, snsArn, members) => {
  const attributesManager = handlerInput.attributesManager;
  let groupAttribute = {
    "group": group,
    "snsarn": snsArn,
    "members": members
  };
  groupAttribute.members.push({
    "name": name,
    "phoneNumber": phoneNumber
  });

  // Adds a new member to the SNS subscription
  subscribe(snsArn, phoneNumber);
  
  console.log('Returned groupAttribute:', groupAttribute);
  attributesManager.setPersistentAttributes(groupAttribute);
  attributesManager.savePersistentAttributes();
};

// TODO: Finish Intent
const AddMemberIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AddMemberIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput = 'What is the first name and phone number of the the person you want to add?';
    const repromptText = 'Sorry, I didn\'t catch that.';

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptText)
        .getResponse();
  }
}

const AddGroupMemberIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddGroupMemberIntent';
  },
  async handle(handlerInput) {
    const name = handlerInput.requestEnvelope.request.intent.slots.name.value;
    const phoneNumber = handlerInput.requestEnvelope.request.intent.slots.phoneNumber.value;

    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = await attributesManager.getSessionAttributes() || {};
    const group = sessionAttributes.hasOwnProperty('group') ? sessionAttributes.group : 0;
    const snsArn = sessionAttributes.hasOwnProperty('snsarn') ? sessionAttributes.snsarn : 0;
    const members = sessionAttributes.hasOwnProperty('members') ? sessionAttributes.members : 0;

    addMemberToGroup(handlerInput, name, phoneNumber, group, snsArn, members);

    const speakOutput = `${name} added to your group. Can I recommend a place, add another to your group, get your location, or exit?`;
    const repromptText = 'Sorry, I didn\'t catch that.';


    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptText)
        .getResponse();
  }
};

//mobile number from profile
const ProfileMobileIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'ProfileMobileIntent'
    );
  },
  async handle(handlerInput) {
    const { serviceClientFactory, responseBuilder } = handlerInput;
    try {
      const upsServiceClient = serviceClientFactory.getUpsServiceClient();
      const profileMobileObject = await upsServiceClient.getProfileMobileNumber();
      if (!profileMobileObject) {
        const errorResponse = `It looks like you don\'t have a mobile number set. You can set your mobile number from the companion app.`;
        return responseBuilder
          .speak(errorResponse)
          .withSimpleCard(APP_NAME, errorResponse)
          .getResponse();
      }
      const profileMobile = profileMobileObject.phoneNumber;
      const speechResponse = `Hello your mobile number is, <say-as interpret-as="telephone">${profileMobile}</say-as>`;
      const cardResponse = `Hello your mobile number is, ${profileMobile}`;
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
  }
};

//name  from profile
const ProfileNameIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'ProfileNameIntent'
    );
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
  }
};

// Location handler
const DeviceLocationIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name ===
        'DeviceLocationIntent'
    );
  },
  async handle(handlerInput) {
    const {
      requestEnvelope,
      serviceClientFactory,
      responseBuilder
    } = handlerInput;
    try {
      const { deviceId } = requestEnvelope.context.System.device;
      const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
      const address = await deviceAddressServiceClient.getFullAddress(deviceId);
      let response;
      if (
        address == undefined ||
        (address.addressLine1 === null && address.stateOrRegion === null)
      ) {
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
  }
};

// Recommendations Handler
const RecommendationsHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name ===
        'RecommendationsIntent'
    );
  },
  async handle(handlerInput) {
    const {
      requestEnvelope,
      serviceClientFactory,
      responseBuilder
    } = handlerInput;
    try {
      const { deviceId } = requestEnvelope.context.System.device;
      const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
      const address = await deviceAddressServiceClient.getFullAddress(deviceId);
      let response;
      if (
        address == undefined ||
        (address.city === null && address.stateOrRegion === null)
      ) {
        response = responseBuilder.speak(messages.NO_ADDRESS).getResponse();
        return response;
      } else {
        let location =
          address.city.toLowerCase() +
          ', ' +
          address.stateOrRegion.toLowerCase();
        let place = await searcher(location);
        const response = `How about ${place}?`;
        const repromptText = "Sorry, I didn't catch that";
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
  }
};

const searcher = location => {
  const client = yelp.client(API_KEY);
  const searchRequest = {
    location: location
  };

  return client
    .search(searchRequest)
    .then(response => {
      let randomNum = randomizer(response.jsonBody.businesses.length - 1);
      resultName = response.jsonBody.businesses[randomNum].name;
      resultUrl = response.jsonBody.businesses[randomNum].url;
      // Alexa cannot handle the '&' and needs conversion to 'and'
      if (resultName.includes('&')) {
        resultName = resultName.replace(/&/g, 'and');
      }
      return resultName;
    })
    .catch(e => {
      console.log(e);
    });
};

const randomizer = max => {
  const randomNum = Math.floor(Math.random() * max);
  console.log('Random number:', randomNum);
  return randomNum;
};

// Recommendations Response Handler
const RecommendationsYesHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent'
    );
  },
  handle(handlerInput) {
    //SNS message send
    // Create publish parameters
    var params = {
      Message: `<a href=${resultUrl}>${resultName}</a>`, /* required */
      TopicArn: SNSArn
    };
    // Create promise and SNS service object
    var publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
      .publish(params)
      .promise();
    // Handle promise's fulfilled/rejected states
    publishTextPromise
      .then(function(data) {
        console.log(
          'Message ${params.Message} send sent to the topic ${params.TopicArn}'
        );
        console.log('MessageID is ' + data.MessageId);
      })
      .catch(function(err) {
        console.error(err, err.stack);
      });

    const speakOutput = `A message is being sent to the people in your group`; // change to variable / slot name
    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  }
};

const RecommendationsNoHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent'
    );
  },
  handle(handlerInput) {
    return RecommendationsHandler.handle(handlerInput);
  }
};

//help
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput =
      'I can recommend a place, add you to a group, check your device location, check your name, check your phone number, or exit. How can I help?';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

//stop
const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'AMAZON.CancelIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          'AMAZON.StopIntent')
    );
  },
  handle(handlerInput) {
    const speakOutput = 'Goodbye!';
    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  }
};

//end
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      'SessionEndedRequest'
    );
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
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `You just triggered ${intentName}`;

    return (
      handlerInput.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
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

const LoadHasGroupInterceptor = {
    async process(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = await attributesManager.getPersistentAttributes() || {};
        const group = sessionAttributes.hasOwnProperty('group') ? sessionAttributes.group : 0;
        const snsArn = sessionAttributes.hasOwnProperty('snsarn') ? sessionAttributes.snsarn : 0;
        const members = sessionAttributes.hasOwnProperty('members') ? sessionAttributes.members : 0;

        if (group && snsArn && members) {
            attributesManager.setSessionAttributes(sessionAttributes);
        }
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
  .withApiClient(new Alexa.DefaultApiClient())
  .withPersistenceAdapter(
    new persistenceAdapter.S3PersistenceAdapter({
      bucketName: process.env.S3_PERSISTENCE_BUCKET
    })
  )
  .addRequestHandlers(
    LaunchRequestHandler,
    ProfileMobileIntentHandler,
    ProfileNameIntentHandler,
    DeviceLocationIntentHandler,
    RecommendationsHandler,
    RecommendationsYesHandler,
    RecommendationsNoHandler,
    AddMemberIntentHandler,
    AddGroupMemberIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
  )
  .addRequestInterceptors(LoadHasGroupInterceptor)
  .addErrorHandlers(ErrorHandler)
  .lambda();
