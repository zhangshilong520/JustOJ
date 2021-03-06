'use strict';

/**
 * Module dependencies.
 */
var express = require('express');
var router = express.Router();

var _ = require('lodash');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var async = require('async');
var entities = require('entities');
//var moment = require('moment');
var path = require('path');
var fs = require('fs');
var Busboy = require('busboy');
var slug = require('slug');
var url = require('url');
var has = require('has');
var typeis = require('type-is');
var crypto = require('crypto');
var logger = require('winston');
var Hashids = require('hashids');
var config = require('nconf');

//var MyUtil = appRequire('lib/myutil');
var Problems = appRequire('models/problems');
var removeTestCase = require('./problem/removeTestCase');

//var EditProblem = appRequire('edit_problem/editProblem');

var testJudgeSolution = require('./problem/judgeSolution');
var AppError = appRequire('lib/custom-error');
var Schema = appRequire('config/validator-schema');
var OK = appRequire('middlewares/OK');
var authJwt = appRequire('middlewares/authJwt');
var roles = appRequire('middlewares/roles');
var authUser = appRequire('middlewares/authUser');
var decodeHash = appRequire('middlewares/decodeHash');

slug.defaults.mode ='pretty';

var problemHash = new Hashids(config.get('HASHID:PROBLEM'), 11);
var contestHash = new Hashids(config.get('HASHID:CONTEST'), 11);


/**
 *
 */
router.get('/list', authUser, function(req, res, next) {

  var cur_page;
  if( !has(req.query,'page') || parseInt(req.query.page) < 1 )
    cur_page = 1;
  else
    cur_page = parseInt(req.query.page);

  var URL = url.parse(req.originalUrl).pathname;
  var uid = req.user ? req.user.id : null;


  //TODO:
  //TODO: AGAIN TODO!!:  please please check the query with user id in model, is it horrible when submission table is too huge??
  Problems.findProblems(uid, cur_page, URL, function(error, problems, pagination) {
    if( error ) {
      logger.error('what');
      logger.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }


    _.forEach(problems, function(val, indx){
      problems[indx].id = problemHash.encode(problems[indx].id);
    });

    logger.debug(problems);
    logger.debug(pagination);
    logger.debug('isLoggedIn = ', !!uid);

    res
      .status(200)
      .json({
        problems: problems,
        pagination: pagination
      });
  });
});


//
// create a new problem
//
router
  .route('/create')
  //checking logged in and admin privilege
  .all(authJwt, roles('admin'), OK())
  //return ok to load front end
  .get(OK('ok'))
  .post(function(req, res, next) {

    if( !req.body ){
      return res.status(400).json({ error: 'Request body not found' });
    }


    //if contest problem, decode & validate contest id
    if( has(req.body,'cid') ){
      var cid = contestHash.decode(req.body.cid);
      if(!cid || !cid.length){
        return res.status(404).json({ error: 'no contest found' });
      }
      req.body.cid = cid[0];
    }
    else{
      req.body.cid = null;
    }


    var titleSlug = slug(req.body.title.replace(/[^a-zA-Z0-9 ]/g, ' '));

    async.waterfall([
      function validateInput(callback){
        req.sanitize('statement').escapeInput();
        req.sanitize('title').escapeInput();
        req.sanitize('author').escapeInput();
        req.sanitize('input').escapeInput();
        req.sanitize('output').escapeInput();
        req.checkBody(Schema.problem);

        logger.debug('validatin inputs..');

        req
          .getValidationResult()
          .then(function(result) {
            if (!result.isEmpty()){
              var e = result.array()[0];
              logger.debug(result.array());
              return callback(new AppError(e.param + ' ' + e.msg,'input'));
            }
            req.body.slug = entities.encodeHTML(titleSlug);
            return callback();
          });
      },
      async.apply(Problems.save, req.body)
    ],
    function(err, pid){
      if(err){
        if(err.name === 'input')
          return res.status(400).json({ error: err.message });

        logger.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      logger.debug('success');
      logger.debug(pid);
      logger.debug(problemHash.encode(pid));

      res.status(200).json({
        id: problemHash.encode(pid),
        slug: titleSlug
      });
    });
  });


//
// send raw test case file
//
router
  .get('/testcase/:pid/:caseId', authJwt, roles('admin'), decodeHash(true,['id']), function(req, res, next){

    var caseType = req.query.type;
    if( !caseType ){
      return res.status(404).json({ error: 'Invalid Test Case Type' });
    }

    //var problemSlug = req.params.slug;
    var pid = req.body.problem.id;
    var caseId = req.params.caseId;

    logger.debug(caseType);

    var caseName = caseType === 'input' ? 'i.txt' : 'o.txt';
    var caseDir = getCasePath(pid,caseId,caseName); //path.normalize(process.cwd() + '/files/tc/p/' + pid + '/' + caseId + '/' + caseName);
    logger.debug(caseDir);
    fs.stat(caseDir, function(err,stats){
      if(err){
        if( err.code === 'ENOENT' ){
          return res.status(404).json({ error: 'No Test Case Found' });
        }

        logger.error(err);
        return res.sendStatus(500);
      }

      if( stats.isFile() ){
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': stats.size
        });
        var readStream = fs.createReadStream(caseDir);
        readStream.pipe(res);
        return;
      }

      res.status(404).json({ error: 'No Test Case Found' });
    });

  });


//
// edit testcases of a problem
//
router
  .route('/edit/testcase/:pid')
  .all(authJwt, roles('admin'), decodeHash(true, ['id']), OK())
  .get(function(req, res, next){

    var problemId = req.body.problem.id;

    async.waterfall([
      function(callback){
        var rootDir = getCasePath(problemId);  // path.normalize(process.cwd() + '/files/tc/p/' + problemId);
        logger.debug(rootDir);
        fs.readdir(rootDir, function(err, files) {

          if( err ){
            //no test cases added yet!
            if( err.code === 'ENOENT' ){
              return callback(null,[]);
            }

            return callback(err);
          }

          if(files){
            return callback(null, files);
          }

          callback(null,[]);
        });
      }
    ],
    function (error, cases) {
      if( error ) {
        if(error.name === 'input'){
          return res.status(404).json({ error: error.message });
        }

        logger.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      logger.debug(cases);

      var cas = _.map(_.times(cases.length), function(c){
        return { id: c, hash: cases[c] };
      });

      logger.debug(cas);

      res.status(200).json(cas);
    });
  })
  .post(function(req, res, next){

    var pid = req.body.problem.id;
    var action = req.query.action;

    //remove the test case
    if( action === 'remove' ){
      if( !req.body.case ){
        return res.status(400).json({ error: 'Test Case Id required' });
      }
      return removeTestCase(pid, req.body.case, res);
    }


    async.waterfall([
      //create unique random id
      function (callback){
        crypto.randomBytes(20, function(err, buf) {
          if(err){
            return callback(err);
          }

          var testCaseId = buf.toString('hex');
          callback(null, testCaseId);
        });
      },
      //create directory of the test case
      function (testCaseId, callback){

       // var saveTo = path.normalize(process.cwd() + '/files/tc/p/' + pid + '/' + testCaseId);
        var saveTo = getCasePath(pid, testCaseId);
        logger.debug(saveTo);

        mkdirp(saveTo, function (err) {
          if (err){
            return callback(err);
          }

          logger.info(saveTo + ' test case dir created, for problem pid: ' + testCaseId);

          callback(null, saveTo, testCaseId);
        });
      },
      //save test case
      function (saveTo, testCaseId, callback){
        //init file upload handler
        var busboy = new Busboy({ headers: req.headers });
        //[0] = input file path, [1] = output file path
        var namemap = [saveTo + '/i.txt', saveTo + '/o.txt'];
        //
        var noFile = 0;
        //index of namemap
        var fname = 0;

        busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {

          //I have no idea why i was doing this!
          if( noFile || !filename ){
            noFile = 1;
            file.resume();
            return;
          }

          file.pipe(fs.createWriteStream(namemap[fname++]));
        });

        busboy.on('finish', function() {
          //at lest 2 files should uploaded
          if( noFile || fname!==2 ){
            return clearUpload(saveTo, callback);
          }

          return callback(null, testCaseId);
        });

        req.pipe(busboy);
      }
    ],
    function(err, testCaseId){
      if(err){
        if(err.name === '404'){
          return res.status(404).json({ error: err.message });
        }

        if(err.name === 'input'){
          return res.status(400).json({ error: err.message });
        }

        logger.error(err);
        return res.sendStatus(500);
      }
      res.sendStatus(200);
    });
  });


//
// edit /add limits of a problem
//
router
  .route('/edit/limits/:pid')
  .all(authJwt, roles('admin'), decodeHash(true, ['id']), OK())
  .get(function(req, res){

    var pid = req.body.problem.id;

    logger.debug(pid);

    Problems.hasTestCase(pid, function(err, hasTc){
      if(err){
        logger.error(err);
        return res.sendStatus(500);
      }

      if(!hasTc){
        return res.status(303).json({ error: 'Add some test case first' });
      }

      return res.sendStatus(200);
    });
  })
  .post(function(req, res, next){

    if(
      (!has(req.query,'action') || req.query.action !== 'save') &&
      typeis(req, ['multipart'])
    ){
      return testJudgeSolution(req, res, next);
    }

    var pid = req.body.problem.id;

    async.waterfall([
      function(callback){
        req.checkBody(Schema.problemLimit);
        req
          .getValidationResult()
          .then(function(result) {
            if (!result.isEmpty()){
              var e = result.array()[0];
              logger.debug(result.array());
              return callback(new AppError(e.param + ' ' + e.msg,'input'));
            }
            return callback();
          });
      },
      async.apply(Problems.hasTestCase, pid),
      function(testCases, callback){
        //no test case found
        if( !testCases ){
          return callback(new AppError('No Test Case Found','303'));
        }

        Problems.updateByColumn(pid, {
          cpu: parseInt(parseFloat(req.body.cpu)*1000.0),
          memory: 256,
          status: 'public'
        }, callback);
      }
    ],
    function(err){
      if(err){
        switch(err.name){
          case 'input':
            return res.status(400).json({ error: err.message });
          case '303':
            return res.status(303).json({ error: 'Add Some Test Cases First' });
          default:
            logger.error(err);
            return res.sendStatus(500);
        }
      }
      res.sendStatus(200);
    });
  });



//
//
//
router.get('/rank/:pid', decodeHash(), function(req, res, next) {
  var pid = req.body.problemId;

  Problems.findRank(pid, function(err, ranks){
    if( err ){
      logger.error(err);
      return res.sendStatus(500);
    }

    if(!ranks || !ranks.length){
      return res.status(200).json([]);
    }

    logger.debug('ranks: ',ranks);

    return res.status(200).json(ranks);
  });
});


//
//
//
router.get('/submission/u/:pid', authJwt, decodeHash(), function(req, res, next) {
  var pid = req.body.problemId;
  var userId = req.user.id;

  Problems.userSubmissions(pid, userId, function(err, subs){
    if( err ){
      logger.error(err);
      return res.sendStatus(500);
    }

    if(!subs || !subs.length){
      return res.status(200).json([]);
    }

    logger.debug('user subs: ', subs);

    _.forEach(subs, function(val, indx){
      subs[indx].id = indx + 1;
    });

    return res.status(200).json(subs);
  });
});




//
//
//
router
  .route('/:pid')
  .get(decodeHash(), function(req, res, next) {

    var pid = req.body.problemId;

    Problems.findByIdandTags(pid,function(err, rows){
      if( err ){
        logger.error(err);
        return res.sendStatus(500);
      }

      if(!rows || !rows.length){
        return res.status(404).json({ error: 'No Problem Found' });
      }

      var problem = rows[0];
      logger.debug(problem);
      if(problem.status !== 'public'){
        return res.sendStatus(403);
      }

      problem.title = entities.decodeHTML(problem.title);
      problem.statement = entities.decodeHTML(problem.statement);
      problem.input = entities.decodeHTML(problem.input);
      problem.output = entities.decodeHTML(problem.output);

      return res.status(200).json(problem);
    });
  })
  .post(authJwt, decodeHash(), require('./problem/submit'));











// /**
//  *
//  */
// router.post('/languages/template/:languageIndex', function(req, res, next) {

//   var languageIndex = parseInt(req.params.languageIndex);

//   var resObj = {
//     status: 'success',
//     template: ''
//   };

//   if( !MyUtil.isNumeric(languageIndex) )
//     resObj.status = 'error';
//   else{
//     resObj.template = MyUtil.langTemplates(languageIndex);
//     if( resObj.template === 'error' )
//       resObj.status = 'error';
//   }

//   res.json(resObj);
//   res.end();
// });










//
// clear temporary uploaded file
//
function clearUpload(remDir, callback){
  rimraf(remDir, function(error){
    if( error )
      logger.error(error);
    else
      logger.debug('Cleaned uploaded TC');

    callback(new AppError('File required','input'));
  });
};


//
// get a test case full path
//
function getCasePath(pid, caseId, caseName){
  if( !caseId || caseId === undefined ){
    return path.join(process.cwd(), '..', 'judger', 'testcase', pid.toString());
  }
  if( !caseName || caseName === undefined ){
    return path.join(process.cwd(), '..', 'judger', 'testcase', pid.toString(), caseId.toString());
  }
  return path.join(process.cwd(), '..', 'judger', 'testcase', pid.toString(), caseId.toString(), caseName.toString());
}


module.exports = router;
