'use strict';

var User = appRequire('models/user');
var Promise = require('bluebird');
var logger = require('winston');

//
// Check if a username already exists
//
function userExists(username){

  return new Promise(function(resolve, reject){
    User.available(username, null, function(err, rows){
      if(err){
        logger.error(err);
        throw err;
      }
      if(rows && rows.length){
        return reject();
      }
      resolve();
    });
  });
}


//
// check if email already registered
//
function emailExists(email){

  return new Promise(function(resolve, reject){
    User.available(null, email, function(err, rows){
      if(err){
        logger.error(err);
        throw err;
      }
      if(rows && rows.length){
        return reject();
      }
      resolve();
    });
  });
}

module.exports = {
  userExists: userExists,
  emailExists: emailExists
};