/* eslint-disable no-undef */
//this version of the code is deployed through the ASK CLI
//deployed to the skill named "idk"
//held by account: teamcodebreakers

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
let resultAddress;
let resultRating;

/*
Helper Functions
*/
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
      resultAddress = response.jsonBody.businesses[randomNum].location.address1;
      resultRating = response.jsonBody.businesses[randomNum].rating;
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
  return randomNum;
};

// Subscribe to the SNS
const subscribe = (snsArn, phoneNumber) => {
  let subArn;
  const sns = new AWS.SNS();
    profileMobile = '+1' + phoneNumber;
    const params = {
      Protocol: 'sms',
      TopicArn: snsArn,
      Endpoint: profileMobile,
      ReturnSubscriptionArn: true || false
    };
    return new Promise((resolve, reject)=>{
      sns.subscribe(params, function(err, data) {
        if (err) {
          console.log('ERR: ', err);
          reject(err);
        } else {
          subArn = data.SubscriptionArn;
          console.log('DATA: ', data);
          resolve(subArn);
        }
      });
    })
    
};

// Unsubscribe to the SNS
const unsubscribe = (subArn) => {
  const sns = new AWS.SNS();

  var params = {
    SubscriptionArn: subArn /* required */
  };

  sns.unsubscribe(params, function(err, data) {
    if (err) {
      console.log('UNSUBSCRIBE ERROR: ', err);
    } else  {
      console.log('UNSUBSCRIBE SUCCESS: ', data);
    }
  });
};

// Removes the member from the group
const removeMemberFromGroup =  (handlerInput, phoneNumber, members, sessionAttributes) => {
  const { serviceClientFactory } = handlerInput;
  const attributesManager = handlerInput.attributesManager;

  const upsServiceClient = serviceClientFactory.getUpsServiceClient();
  const profileMobileObject = upsServiceClient.getProfileMobileNumber();
  let profileMobile = profileMobileObject.phoneNumber;

  console.log('removeMemberFromGroup(): ', members);

  if (members.length > 1) {
    for( var i = 0; i < members.length; i++) { 

      if (members[i].phoneNumber === phoneNumber && members[i] !== profileMobile) {
        console.log('Removed: ', members[i]);
        unsubscribe(members[i].subscriptionArn);
        members.splice(i, 1);
        break;
      }
    }
    
    console.log('Returned groupAttribute:', sessionAttributes);
    attributesManager.setPersistentAttributes(sessionAttributes);
    attributesManager.savePersistentAttributes();

    return `Removed member from your group. Can I recommend a place, add another to your group, get your location, or exit?`
  } else {
    console.log('Nothing to remove!');
    return 'There are no members from your group to remove.'
  }
};

//Sets the initial group for s3
const setInitialGroup = (handlerInput, name, phoneNumber, snsArn) => {
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

  subscribe(snsArn, phoneNumber)
    .then((res)=>{
      console.log('addMemberToGroup subArn:', res);

      groupAttribute.members.push({
        "name": name,
        "phoneNumber": phoneNumber,
        "subscriptionArn": res
      });

      attributesManager.setPersistentAttributes(groupAttribute);
      attributesManager.savePersistentAttributes();
    })
    .catch((err)=>{
      console.log("probably helpful with a string: " + err);
    })
  
  
};


/* 
Main Skill: Handlers
*/

// Initial handler
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const { serviceClientFactory, responseBuilder } = handlerInput;
    try {
      //grab the profile name  and phone numbrer on the account
      const upsServiceClient = serviceClientFactory.getUpsServiceClient();
      const profileName = await upsServiceClient.getProfileName();
      const profileMobileObject = await upsServiceClient.getProfileMobileNumber();
      //take the phone number from the object
      let profileMobile = profileMobileObject.phoneNumber;

      const attributesManager = handlerInput.attributesManager;
      const sessionAttributes = attributesManager.getSessionAttributes() || {};
      const group = sessionAttributes.hasOwnProperty('group') ? sessionAttributes.group : 0;
      const snsArn = sessionAttributes.hasOwnProperty('snsarn') ? sessionAttributes.snsarn : 0;
      const members = sessionAttributes.hasOwnProperty('members') ? sessionAttributes.members : 0;

      let speakOutput;
      
      if (group) {
        speakOutput = `Welcome back, ${profileName}, Can I recommend a place? Or you can say help.`;
      } else {
        //   Creates SNS Topic
        let createTopicPromise = new AWS.SNS()
          .createTopic({ Name: profileName })
          .promise();

        // Handle promise's fulfilled/rejected states
        createTopicPromise
          .then(function(data) {
            SNSArn = data.TopicArn;
            console.log("SNSArn at launch 231: " + SNSArn);
            return subscribe(SNSArn, profileMobile);
          })
          .then(() => {
            //   Creates the group in s3
            return setInitialGroup(handlerInput, profileName, profileMobile, SNSArn);
          })
          .catch(function(err) {
            console.error(err, err.stack);
          });

        speakOutput = `Hey ${profileName}, welcome to Feed Me Now, I can recommend a place, add a member to your group, or say help for more options.`;
      }
      
      const repromptText = "Sorry, I didn't catch that.";

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withSimpleCard(APP_NAME, speakOutput)
        .reprompt(repromptText)
        .getResponse();
    } catch (error) {
      console.log('ERROR: ', error);
      const speakOutput = `Welcome to Feed Me Now, where I recommend places to eat. Huh, looks like I can't access the right permissions.  Open the companion app, choose our skill, and enable all permissions.`;
      const repromptText = "Sorry, I didn't catch that.";
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withSimpleCard(APP_NAME, speakOutput)
        .reprompt(repromptText)
        .getResponse();
    }
  }
};

const AddMemberIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AddMemberIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput = 'What\'s the first name and number of the the person you want to add?';
    const repromptText = 'Sorry, I didn\'t catch that.';

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptText)
        .getResponse();
  }
}

// give specific member information for the add 
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

    const speakOutput = `${name} added. Can I recommend a place, add another person, or help?`;
    const repromptText = 'Sorry, I didn\'t catch that.';

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptText)
        .getResponse();
  }
};

// Remove a member from the group prompt
const RemoveMemberIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'RemoveMemberIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput = 'What\'s the phone number of the person to remove?';
    const repromptText = 'Sorry, I didn\'t catch that.';

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptText)
        .getResponse();
  }
}

// Remove a member from the group handler
const RemoveGroupMemberIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RemoveGroupMemberIntent';
  },
  async handle(handlerInput) {
    const phoneNumber = handlerInput.requestEnvelope.request.intent.slots.phoneNumber.value;

    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = await attributesManager.getSessionAttributes() || {};
    const members = sessionAttributes.hasOwnProperty('members') ? sessionAttributes.members : 0;

    const speakOutput = await removeMemberFromGroup(handlerInput, phoneNumber, members, sessionAttributes);
    const repromptText = 'Sorry, I didn\'t catch that.  What is the phone number of the the person you want to remove?';

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
      //grab address from alexa device
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
        //api call to yelp
        let place = await searcher(location);
        //populate response
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
          .withAskForPermissionsConsentCard([MOBILE_PERMISSION])
          .getResponse();
      }
      console.log(JSON.stringify(error));
      const response = responseBuilder.speak(messages.ERROR).getResponse();
      return response;
    }
  }
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
    let message = "Name: " + resultName + ", Rating: " + resultRating + ", Address: " + resultAddress;
    // Create publish parameters
    var params = {
      Message: message, /* required */
      TopicArn: SNSArn
    };
    
    // Create promise and SNS service object
    var publishTextPromise = new AWS.SNS({ apiVersion: '2019-10-07' })
      .publish(params)
      .promise();
    // Handle promise's fulfilled/rejected states
    publishTextPromise
      .then(function(data) {
        console.log(
          `Message ${params.Message} send sent to the topic ${params.TopicArn}`
        );
        console.log('MessageID is ' + data.MessageId);
      })
      .catch(function(err) {
        console.error(err, err.stack);
      });

    const speakOutput = `Great, a message is being sent to your group`; // change to variable / slot name
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
      'I can recommend a place, add a member to your group, remove a member, check your location, check your name, check your phone number, or exit. How can I help?';
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
    RemoveMemberIntentHandler,
    RemoveGroupMemberIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
  )
  .addRequestInterceptors(LoadHasGroupInterceptor)
  .addErrorHandlers(ErrorHandler)
  .lambda();
