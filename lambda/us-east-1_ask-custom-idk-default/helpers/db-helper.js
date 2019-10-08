const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const tableName = 'idk';
const docClient = new AWS.DynamoDB.DocumentClient();

class Helper {
  constructor() { }

  addName(name, userID) {
    return new Promise((resolve, reject) => {

      const params = {
        TableName: tableName,
        Item: {
          'id': userID,
          'name': name
        }
      };

      docClient.put(params, (err, data) => {
        if (err) {
          console.log("Unable to insert =>", JSON.stringify(err));
          return reject("Unable to insert");
        }
        
        console.log("Saved Data, ", JSON.stringify(data));
        resolve(data);
      });
    });
  }

  getNames() {
    return new Promise((resolve, reject) => {
      const params = {
        TableName: tableName
      };

      docClient.scan(params, (err, data) => {
        if (err) {
          console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
          return reject(JSON.stringify(err, null, 2));
        }
        console.log("GetItem succeeded:", JSON.stringify(data, null, 2));
        resolve(data.Items);
      });
    });
  }

  deleteName(name) {
    return new Promise((resolve, reject) => {
      const params = {
        TableName: tableName,
        Key: {
          'name': name
        }
      };

      docClient.delete(params, (err, data) => {
        if (err) {
          console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
          return reject(JSON.stringify(err, null, 2));
        }
        console.log("GetItem succeeded:", JSON.stringify(data, null, 2));
        resolve(data.Items);
      });
    });
  }


}

module.exports = new Helper();
