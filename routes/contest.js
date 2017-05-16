'use strict';

/**
 * Route for home page
 * @type {*|exports|module.exports}
 */

var express = require('express');
var router = express.Router();


var json2csv = require('json2csv');
var has = require('has');
var entities = require('entities');
var _ = require('lodash');
var moment = require('moment');
var async = require('async');
var path = require('path');
var fs = require('fs');
var Busboy = require('busboy');
var uuid = require('uuid');
var rimraf = require('rimraf');
var url = require('url');
var mkdirp = require('mkdirp');

var MyUtil = require('../lib/myutil');
var Submission = require('../models/submission');
var isLoggedIn = require('../middlewares/isLoggedIn');
var roles = require('../middlewares/userrole');
var Contest = require('../models/contest');
var ContestSubmit = require('../models/contestSubmit');
var Problems = require('../models/problems');

var debug = require('debug')('routes:contest');

/**
 *
 */
router.get('/' , function(req, res, next) {

    Contest.getPublic(function(err,running,future,ended){
        if(err){
            return next(new Error(err));
        }

        debug(running);
        debug(future);
        debug(ended);

        res.render('contest/contests',{
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            running: running,
            future: future,
            ended: ended,
            moment: moment
        });
    });
});


/**
 *
 */
router.get('/past' , function(req, res, next) {

    var cur_page = req.query.page;

    if( _.isUndefined(cur_page) || parseInt(cur_page) < 1 )
        cur_page = 1;
    else
        cur_page = parseInt(cur_page);

    var URL = url.parse(req.originalUrl).pathname;
    Contest.getPastContests(cur_page,URL, function (err,rows,pagination) {
        if(err)
            return next(new Error(err));

        debug(rows);
        res.render('contest/past_contests',{
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            ended: rows,
            moment: moment,
            pagination: _.isUndefined(pagination) ? {} : pagination
        });
    });
});


/**
 *
 */
router.get('/host' , function(req, res, next) {
    return res.end('coming soon');
    /* res.render('contest/host',{
     active_nav: "contest",
     isLoggedIn: req.isAuthenticated(),
     user: req.user
     });*/
});


/**
 *  Create a contest
 */
router.get('/create', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    if( !req.isAuthenticated() )
        return res.end('unauthorized');

    res.render('contest/create',{
        active_nav: 'contest',
        isLoggedIn: req.isAuthenticated(),
        user: req.user,
        errors: req.flash('err')
    });
});



/**
 * Delete a contest
 */
router.post('/delete', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cid = req.body.cid;

    debug('contest id: ' + cid);

    Contest.delete(cid, function (err ,rows) {
        if(err){
            debug(err);
            return next(new Error(err));
        }

        debug('contest deleted');
        req.flash('success','contest successfully removed');
        res.redirect('/contests/edit');
    });
});



/**
 *
 */
router.get('/edit', /*isLoggedIn(true) , roles.is('admin'),*/ function(req, res, next) {

    /*
    if( !req.isAuthenticated() )
        return res.end('unauthorized');
*/
    Contest.getEditable(function(err,rows){

        if(err){ return next(new Error(err)); }

        debug(rows);

        res.render('contest/edit/contest_list',{
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            contests: rows,
            moment: moment,
            errors: req.flash('err'),
            success: req.flash('success')
        });
    });

});



/**
 *
 */
router.post('/edit/removealluser',/*isLoggedIn(true) , roles.is('admin'), */function(req, res, next) {

    var cid = req.body.cid;

    Contest.removealluser(cid, function (err, rows) {
        if(err) return next(new Error(err));

        req.flash('success', 'successfully removed all user');
        res.redirect('/contests/edit/' + cid);
    });
});


/**
 *
 */
router.post('/edit/edituser/:cid', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cid = req.params.cid;
    var uid = req.body.userid;
    var username = req.body.username;
    var name = req.body.name;
    var password = req.body.password;
    var institute = req.body.institute;

    debug(req.body);

    var insertObj = {
        username: username,
        name: name,
        institute: institute,
        password: password,
        email   : ''
    };

    Contest.editUser(cid,uid,insertObj,function (err,rows) {

        if(err){
            debug(err);

            if( typeof err === 'string' )
                res.json({ status: 'error', error: err });
            else
                res.json({ status: 'error', error: 'error' });

            return;
        }

        res.json({ status: 'success' });
    });
});


/**
 * Generate random user for a contest
 */
router.post('/edit/generateuser/:cid', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var quantity = req.body.quantity;
    var cid = req.params.cid;

    if( !MyUtil.isNumeric(quantity) )
        return next(new Error('404'));

    if( quantity< 0 || quantity > 100 ){
        req.flash('error', 'quantity of number of user to generate must be between 1 and 100');
        res.redirect('/contests/edit/' + cid);
        return;
    }

    async.waterfall([
        function (callback) {
            Contest.findById(cid,function (err,rows) {
                if(err) return callback(err);

                if(!rows || rows.length === 0) return callback('404');

                callback();
            });
        },
        function (callback) {
            var usr = [];
            for(var i=0; i<quantity; i++) usr.push(i);

            async.eachSeries(usr, Contest.generateUser.bind(null,cid) , callback);
        }
    ],function (err,rows) {
        if(err){
            debug(err);
            return next(new Error('error while...'));
        }

        req.flash('success', 'successfully added ' + quantity + ' users');
        res.redirect('/contests/edit/' + cid);
    });
});



/**
 * Insert a user for a contest
 */
router.post('/edit/insertuser/:cid', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var username = req.body.username;
    var name = req.body.name;
    var password = req.body.password;
    var institute = req.body.institute;
    var random_password = !_.isUndefined(req.body.random_password);
    var cid = req.params.cid;

    var insertObj = {
        username: username,
        name: name,
        institute: institute,
        password: password,
        email   : '',
        role    : 'genuser'
    };


    Contest.insertUser(cid, random_password , insertObj, function (err,rows) {

        if(err){
            if( typeof rows === 'string' && rows === 'username already taken by someone' )
                req.flash('err', rows);
            else
                return next(new Error(err));
        }
        else {
            req.flash('success', 'user successfully added');
        }

        res.redirect('/contests/edit/' + cid);
    });
});


/**
 *
 */
router.post('/edit/removeuser/:cid', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cid = req.params.cid;
    var isJson = req.headers['content-type'] === 'application/json';

    Contest.removeUser(cid, req.body, function (err, rows) {

        if(err){
            if( isJson ){
                req.flash('err', 'error while processing request');
                res.json({ status: 'error', error: 'error' });
                return;
            }
            return next(new Error(err));
        }


        if( !isJson ){
            req.flash('success', 'user successfully removed');
            res.redirect('/contests/edit/' + cid);
            return;
        }

        req.flash('success', 'users successfully removed');
        res.json({ status: 'success' });
    });
});



/**
 *   Edit a contest
 */
router.get('/edit/:cid', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    async.waterfall([
        function(callback) {
            Contest.getDetails(req.params.cid,function(err,rows){
                if(err){ return callback(err); }

                if( !rows || rows.length === 0 ) return callback('404');

                callback(null,rows);
            });
        },
        function(details,callback) {
            Contest.getProblems(req.params.cid,function(err,rows){
                if(err){ return callback(err); }

                callback(null,details,rows);
            });
        },
        function (details,problems,callback) {
            if( details[0].privacy !== 0 ) return callback(null,details,problems,[]); //if not private contest

            var cur_page = req.query.page;

            if( _.isUndefined(cur_page) || parseInt(cur_page) < 1 )
                cur_page = 1;
            else
                cur_page = parseInt(cur_page);

            var URL = url.parse(req.originalUrl).pathname;
            var LIMIT = 50;
            Contest.getParticipants(req.params.cid,cur_page,URL, LIMIT, function (err,rows,pagination) {
                if( err ) return callback(err);

                callback(null,details,problems,rows,pagination);
            });
        }
    ], function (error,details,problems, participants , pagination) {

        if( error ) return next(new Error(error));


        debug(details);
        debug('problems:');
        debug(problems);
        debug('participants:');
        debug(participants);


        var detail = details[0];
        detail['beginDate'] = moment(detail.begin).format('YYYY-MM-DD');
        detail['beginTime'] = moment(detail.begin).format('HH:mm:ss');


        res.render('contest/edit/edit',{
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            cid: req.params.cid,
            errors: req.flash('err'),
            success: req.flash('success'),
            details: detail,
            problems: problems,
            participants: participants,
            pagination: _.isUndefined(pagination) ? {} : pagination
        });
    });
});


/**
 *  Create a new problem of a contest
 */
router.get('/edit/:cid/problems/new',isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    Contest.findById(req.params.cid, function (err,rows) {
        if(err) return next(new Error(err));

        if( rows.length === 0 ) return next(new Error('404, no contest found!'));

        res.render('contest/edit/problems/new',{
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            cid: req.params.cid
        });
    });
});



/**
 *  Contest problem preview in edit arena
 *  TODO: use cid for valid contest?
 */
router.get('/edit/:cid/problems/:pid/preview', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

  //  var cid = req.params.cid;
    var pid = req.params.pid;

    Problems.findById(pid,[],function(err,rows){
        if(err) {
            debug(err);
            res.json({ status: 'error', error: 'error' });
            return;
        }

        res.json({ status: 'success', data: Problems.decodeToHTML(rows[0]) });
    });
});


/**
 *  Contest problem edit step 1, problem details, content etc
 */
router.get('/edit/:cid/problems/:pid/step1', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cid = req.params.cid;
    var pid = req.params.pid;


    Problems.findById(pid,[],function(err,rows){
        if(err) return next(new Error(err));

        if( !rows || rows.length === 0 ) return res.end('404!');

        debug(rows);

        res.render('contest/edit/problems/step_1', {
            active_nav: 'contest',
            title: 'editproblem | JUST Online Judge',
            locals: req.app.locals,
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            _: _,
            pid: pid,
            cid: cid,
            problem: Problems.decodeToHTML(rows[0])
        });

    });
});


/**
 *  Problem edit step 2 , add test cases
 */
router.get('/edit/:cid/problems/:pid/step2',isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cid = req.params.cid;
    var pid = req.params.pid;

    async.waterfall([
        function(callback) {
            Problems.findById(pid,['id'],function(err,row){
                if( err ) return callback(err);

                if( row.length == 0 ) return callback('what you r looking for!');

                callback();
            });
        },
        function(callback){
            var rootDir = path.normalize(process.cwd() + '/files/tc/p/' + pid);
            fs.readdir(rootDir, function(err, files) {
                if( err ){
                    if( err.code === 'ENOENT' ) return callback(null,[]);

                    debug('getTestCases of contest error:: ');
                    debug(err);
                    return callback('getTestCases of contest error');
                }

                if(files){ return callback(null,files); }

                callback(null,[]);
            });
        }
    ], function (error, row) {

        if( error ) return next(new Error(error));

        res.render('contest/edit/problems/step_2', {
            active_nav: 'contest',
            title: 'editproblem | JUST Online Judge',
            locals: req.app.locals,
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            pid: pid,
            cid: cid,
            successMsg: req.flash('tcUpSuccess'),
            errMsg: req.flash('tcUpErr'),
            rsuccessMsg:  req.flash('tcRemSuccess'),
            rerrMsg:  req.flash('tcRemErr'),
            noTestCase: req.flash('noTestCase'),
            data: row
        });
    });
});


/**
 *  Problem edit step 3 - Test and set time limit
 */
router.get('/edit/:cid/problems/:pid/step3',isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    async.waterfall([
        function(callback) {
            Problems.findById(req.params.pid,['id'],function(err,row){
                if( err ) return callback(err);

                if( row.length === 0 ) return callback('what you r looking for!');

                callback();
            });
        },
        function(callback){
            var rootDir = path.normalize(process.cwd() + '/files/tc/p/' + req.params.pid);
            fs.readdir(rootDir, function(err, files) {
                if( err ){
                    if( err.code === 'ENOENT' ) return callback(null,'Please add test case first');   //no test cases added yet!

                    debug('getTestCases error:: ');
                    debug(err);
                    return callback(err);
                }

                if(!files || files.length === 0)
                    return callback(null,'Please add test case first');

                callback();
            });
        }
    ], function (error, noTest) {

        if (error) return next(error);

        if (noTest){
            req.flash('noTestCase', 'Please add at least one test case');
            return res.redirect('/contests/edit/' + req.params.cid + '/problems/'+ req.params.pid +'/step2');
        }

        res.render('contest/edit/problems/step_3', {
            active_nav: 'contest',
            title: 'editproblem | JUST Online Judge',
            locals: req.app.locals,
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            pid: req.params.pid,
            cid: req.params.cid,
            error: req.flash('error')
        });
    });
});


/**
 *  Publish a contest for view from web
 */
router.get('/edit/:cid/publish',isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cid = req.params.cid;

    Contest.update({'status': 2}, cid, function(err,rows){
        if( err ) return next(new Error(err));


        debug('published!');
        res.redirect('/contests/edit');
    });
});


/**
 *  Download a contest participants list
 *  NOTE: if pdf-phantomjs error, run $ node node_modules/phantomjs-prebuilt/install.js
 */
router.get('/participants/download/:cid', function(req, res, next) {

    if( !req.isAuthenticated() || req.user.role !== 'admin' )
        return next(new Error('404'));

    var cid = req.params.cid;

    async.waterfall([
        function (callback) {
            Contest.downloadParticipants(cid, callback);
        },
        function (participants,callback) {
            json2csv({ data: participants, fields: ['username','password'], fieldNames: ['USERNAME', 'PASSWORD'] }, callback);
        }
    ],function (err, csvData) {
        if(err) return next(new Error(err));

        res.attachment('participantsList.csv');
        res.status(200).send(csvData);
    });
});



/**
 *  contest dashboard / problem list
 */
router.get('/:cid', function(req, res, next) {

    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;
    var notStarted = false;

    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err) return callback(err);

                if( !rows || rows.length === 0 ) return callback('404');

                callback(null,rows[0]);
            });
        },
        function(details,callback) {


            if(!isAuthenticated ) return callback(null,details,false); //not resistered

            Contest.isRegistered(cid,user.id,function(err,rows){
                if(err) return callback(err);

                if(rows.length)
                    return callback(null,details,true);

                callback(null,details,false);
            });
        },
        function(details,registered,callback) {

            notStarted = moment().isBefore(details.begin);
            if( notStarted ) return callback(null,details,registered);

            var uid = isAuthenticated ? user.id : -1;
            Contest.getDashboardProblems(cid,uid,function(err,rows){
                if(err) return callback(err);

                callback(null,details,registered,rows);
            });
        }
    ], function (error,details,registered,problems) {

        if( error )
            return next(new Error(error));

        debug(details);
        debug('resitered? : ' + registered);
        debug(problems);

        if( notStarted) {
            res.redirect('/contests/' + cid + '/info');
            return;
        }

        res.render('contest/view/dashboard', {
            active_contest_nav: 'problems',
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            errors: req.flash('err'),
            contest: details,
            registered: registered,
            running: !moment().isAfter(details.end),
            moment: moment,
            problems: problems,
            problemDownloadLink: null //TODO: implement download link generator also db
        });
    });
});


/**
 *  contest announcement,info,details
 */
router.get('/:cid/info', function(req, res, next) {

    debug('yo');

    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;

    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err) return callback(err);

                if( !rows || rows.length === 0 ) return callback('404');

                callback(null,rows[0]);
            });
        },
        function(details,callback) {

            if(!isAuthenticated ) return callback(null,details,false); //not resistered

            Contest.isRegistered(cid,user.id,function(err,rows){
                if(err) return callback(err);

                if(rows.length)
                    return callback(null,details,true);

                callback(null,details,false);
            });
        }
    ], function (error,details,registered) {

        if( error )
            return next(new Error(error));

        debug(details);
        debug('resitered? : ' + registered);

        var state = 'ended';
        if( moment().isBefore(details.begin) )
            state = 'scheduled';
        else if( !moment().isAfter(details.end) )
            state = 'running';

        debug(state);

        res.render('contest/view/announcement',{
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            errors: req.flash('err'),
            contest: details,
            registered: registered,
            state: state,
            moment: moment
        });
    });
});




/**
 *  view a specific clarification
 */
router.get('/:cid/clarifications/view/:clid', isLoggedIn(true), function(req, res, next) {

    var cid = req.params.cid;
    var clarificationId = req.params.clid;
    var notStarted = false;

    async.waterfall([
        function(callback) {
            Contest.getDetailsAndProblemList(cid,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length) return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){
            notStarted = moment().isBefore(contest.begin);
            if( notStarted ) return callback(null,contest);

            Contest.getClarification(cid,clarificationId,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length) return callback('404');

                callback(null,contest,rows[0]);
            });
        }
    ], function (error,contest,clarification) {
        if( error ) return next(new Error(error));

        debug(clarification);

        if( notStarted ){ // not started
            req.flash('err','Contest not started yet');
            res.redirect('/contests/' + cid);
            return;
        }

        res.render('contest/view/clarifications/view',{
            active_contest_nav: 'clarifications',
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            moment: moment,
            contest: contest,
            clarificationId: clarificationId,
            clarification: clarification
        });
    });
});


/**
 *  Respond a clarification
 */
router.get('/:cid/clarifications/respond/:clid', isLoggedIn(true), roles.is('admin'),  function(req, res, next) {

    var cid = req.params.cid;
    var clarificationId = req.params.clid;
    var notStarted = false;

    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err)
                    return callback(err);

                if(!rows || !rows.length)
                    return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){
            notStarted = moment().isBefore(contest.begin);
            if( notStarted )
                return callback(null,contest);

            Contest.getClarification(cid,clarificationId,function(err,rows){
                if(err)
                    return callback(err);

                if(!rows || !rows.length)
                    return callback('404');

                callback(null,contest,rows[0]);
            });
        }
    ], function (error,contest,clarification) {
        if( error )
            return next(new Error(error));

        if( notStarted ){ // not started
            req.flash('err','Contest not started yet');
            res.redirect('/contests/' + cid);
            return;
        }

        debug(clarification);

        res.render('contest/view/clarifications/respond',{
            active_contest_nav: 'clarifications',
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            moment: moment,
            contest: contest,
            err: req.flash('error'),
            clarification: clarification,
            clarificationId: clarificationId
        });
    });
});


/**
 *  request a clarification
 */
router.get('/:cid/clarifications/request', isLoggedIn(true), function(req, res, next) {

    var cid = req.params.cid;
    var user = req.user;
    var usrid = user.id;

    Contest.getDetailsIsReg(cid,usrid,function(err,rows){
        if(err) return next(new Error(err));

        if( !rows || !rows.length ) return next(new Error('404'));

        var contest = rows[0];
        if( moment().isBefore(contest.begin) ){
            req.flash('err','Contest not started yet');
            res.redirect('/contests/' + cid);
            return;
        }

        if( user.role !== 'admin' && parseInt(contest.isReg) === -1 ){
            req.flash('err','You are not participating in this contest');
            res.redirect('/contests/' + cid);
            return;
        }

        var problems;
        if( !has(contest,'problemList') || contest.problemList === null )
            problems = {};
        else
            problems = JSON.parse('{' + contest.problemList + '}');

        res.render('contest/view/clarifications/request', {
            active_contest_nav: 'clarifications',
            active_nav: 'contest',
            title: 'Problems | JUST Online Judge',
            isLoggedIn: req.isAuthenticated(),
            user: user,
            contest: contest,
            moment: moment,
            problems: problems,
            err: req.flash('err'),
            _: _
        });
    });
});


/**
 * TODO: add my option
 *  clarification query. all / general / specific problems clarification
 */
router.get('/:cid/clarifications/:q', isLoggedIn(true), function(req, res, next) {

    var cur_page = req.query.page;
    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;
    var uid = req.user.id;
    var qid = req.params.q;


    if( _.isUndefined(qid) || (qid !== 'all' && qid !== 'general' && qid !== 'my' && !MyUtil.isNumeric(qid)) )
        return next(new Error('404'));


    if( _.isUndefined(cur_page) )
        cur_page = 1;
    else
        cur_page = parseInt(cur_page);

    if( cur_page<1 )
        return next(new Error('400'));

    var notStarted = false;
    async.waterfall([
        function(callback) {
            Contest.getDetailsAndProblemList(cid,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length) return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);

            //not started yet
            if( notStarted ) return callback(null,contest);

            // the pagination part will do in that 'Contest.getClarifications()' function
            var URL = url.parse(req.originalUrl).pathname;
            Contest.getClarifications(cid,uid,qid,cur_page,URL,function(err,rows,pagination){
                if(err) return callback(err);

                callback(null,contest,rows,pagination);
            });
        }
    ], function (error,contest,clarifications,pagination) {
        if( error ) return next(new Error(error));

        debug(contest);
        debug('clarifications--');
        debug(clarifications);

        if( notStarted ){ // not started
            req.flash('err','Contest not started yet');
            res.redirect('/contests/' + cid);
            return;
        }

        var problems;
        if( !has(contest,'problemList') || contest.problemList === null )
            problems = {};
        else
            problems = JSON.parse('{' + contest.problemList + '}');


        debug('problems');
        debug(problems);

        res.render('contest/view/clarifications/clarifications', {
            active_contest_nav: 'clarifications',
            active_nav: 'contest',
            title: 'Problems | JUST Online Judge',
            isLoggedIn: isAuthenticated,
            user: user,
            moment: moment,
            contest: contest,
            problems: problems,
            _: _,
            selected: MyUtil.isNumeric(qid) ? parseInt(qid) : qid,
            clarifications: clarifications,
            pagination: _.isUndefined(pagination) ? {} : pagination
        });
    });
});


/**
 *   submissions of a contest
 */
router.get('/:cid/submissions', isLoggedIn(true), function(req, res, next) {

    var cur_page = req.query.page;
    var cid = req.params.cid;
    var user = req.user;

    if( _.isUndefined(cur_page) )
        cur_page = 1;
    else
        cur_page = parseInt(cur_page);

    if( cur_page<1 )
        return next(new Error('400'));

    var notStarted = false;
    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length){ return callback('404'); }

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);
            if( notStarted ) return callback(null,contest);

            var URL = url.parse(req.originalUrl).pathname;
            Contest.getSubmissions(cid,cur_page,URL,function(err,rows,pagination) {
                if(err) return callback(err);

                callback(null,contest,rows,pagination);
            });
        }
    ], function (error,contest,rows,pagination) {

        if( error )
            return next(new Error(error));

        if( notStarted )
            return res.redirect('/contests/' + cid);

        res.render('contest/view/submissions', {
            active_contest_nav: 'submissions',
            active_nav: 'contest',
            title: 'Problems | JUST Online Judge',
            locals: req.app.locals,
            user: user,
            moment: moment,
            isLoggedIn: true,
            status: rows,
            contest: contest,
            runStatus: MyUtil.runStatus(),
            langNames: MyUtil.langNames(),
            pagination: _.isUndefined(pagination) ? {} : pagination
        });
    });
});


/**
 *   submissions of a problem of a contest
 *   TODO: Mixing normal route and json api is very bad! Create separate API?
 */
router.get('/:cid/submission', function(req, res, next) {

    var isJson = req.headers.accept.indexOf('application/json') > -1;

    if( !has(req.query,'username') || !has(req.query,'problem') ){
        if( isJson ){
            res.status(404).json({ status: 'error', error: '404' });
            return;
        }
        return next(new Error('404'));
    }

    var cid = req.params.cid;
    var username = req.query.username;
    var problemId = req.query.problem;

    var notStarted = false;
    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length){ return callback('404'); }

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);
            if( notStarted ) return callback(null,contest);

            Contest.getUserSubmissionByProblem(cid,problemId,username,function(err,rows) {
                if( err ) return callback(err);

                callback(null,contest,rows);
            });
        }
    ], function (error,contest,rows) {

        if( error ) {
            if( isJson ){
                res.json({ status: 'error', error: 'error' });
                return;
            }
            return next(new Error(error));
        }

        if( notStarted ) {
            if( isJson ){
                res.status(400).json({ status: 'error', error: 'Bad Request' });
                return;
            }
            res.redirect('/contests/' + cid);
            return;
        }

        debug(rows);

        if( isJson ){
            res.json({ status: 'success', data: rows });
            return;
        }

        res.render('contest/view/user_problem_submissions', {
            active_contest_nav: 'submissions',
            active_nav: 'contest',
            title: 'Problems | JUST Online Judge',
            locals: req.app.locals,
            user: req.user,
            moment: moment,
            isLoggedIn: req.isAuthenticated(),
            status: rows,
            contest: contest,
            foruser: username,
            runStatus: MyUtil.runStatus(),
            langNames: MyUtil.langNames(),
            pagination:  { totalPages: function () { return 0; } }
        });
    });
});


/**
 *  submissions of a contest of current logged in user
 */
router.get('/:cid/submissions/u/:username', isLoggedIn(true), function(req, res, next) {

    var problem = req.query.problem;
    var username = req.params.username;
    var cur_page = req.query.page;
    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;
    var active_contest_nav = 'submissions';

    if( username === 'my' || username === req.user.username ) {
        active_contest_nav = 'submissionsmy';
        username = req.user.username;
    }

    if( _.isUndefined(cur_page) )
        cur_page = 1;
    else
        cur_page = parseInt(cur_page);

    if( cur_page<1 )
        return next(new Error('400'));

    var notStarted = false;
    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err){ return callback(err); }

                if(!rows || !rows.length){ return callback('404'); }

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);
            if( notStarted ) return callback(null,contest);

            var URL = url.parse(req.originalUrl).pathname;
            Contest.getUserSubmissions(cid,username,cur_page,URL,function(err,rows,pagination) {
                if( err ) return callback(err);

                callback(null,contest,rows,pagination);
            });
        }
    ], function (error,contest,rows,pagination) {

        if( error ) return next(new Error(error));

        if( notStarted ) {
            res.redirect('/contests/' + cid);
            return;
        }

        debug(rows);

        if( !rows.length || !rows[0].id || rows[0].id === null )
            rows = [];

        res.render('contest/view/user_submissions', {
            active_contest_nav: active_contest_nav,
            active_nav: 'contest',
            title: 'Problems | JUST Online Judge',
            locals: req.app.locals,
            isLoggedIn: isAuthenticated,
            user: user,
            moment: moment,
            foruser: username,
            status: rows,
            contest: contest,
            runStatus: MyUtil.runStatus(),
            langNames: MyUtil.langNames(),
            pagination: _.isUndefined(pagination) ? {} : pagination
        });
    });
});



/**
*
 *
 *
 */
router.get('/:cid/submissions/:sid', isLoggedIn(true), function(req, res, next) {

    var submissionId = req.params.sid;
    var contestId = req.params.cid;

    if( !MyUtil.isNumeric(submissionId) ) return next(new Error('404'));

    var notStarted = true;
    async.waterfall([
        function(callback) {
            Contest.getDetails(contestId,function(err,rows){
                if(err){ return callback(err); }

                if(!rows || !rows.length){ return callback('404'); }

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);
            if( notStarted ) return callback(null,contest);

            Submission
                .getPublicTestCase({ submissionId: submissionId, contestId: contestId }, function (err,rows) {
                    if(err) return callback(err);

                    if(rows.length === 0) return callback('404');

                    var runs = rows[0];

                    if( !has(runs,'cases') || runs.cases === null )
                        runs['cases'] = [];
                    else
                        runs['cases'] = JSON.parse('[' + runs.cases + ']');

                    callback(null,contest, runs);
                });
        }
    ],function (error,contest, runs) {
        if( error ) return next(new Error(error));

        if( notStarted ) {
            res.redirect('/contests/' + contestId);
            return;
        }

        debug(contest);
        debug(runs);

        if( runs.username !== req.user.username ){
            res.end('unauthorized');
            return;
        }

        res.render('contest/view/submission_info', {
            active_contest_nav: 'submissions',
            active_nav: 'contest',
            title: 'Problems | JUST Online Judge',
            locals: req.app.locals,
            submissionId: submissionId,
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            moment: moment,
            contest: contest,
            runs: runs,
            runStatus: MyUtil.runStatus(),
            langNames: MyUtil.langNames()
        });

    });
});


/**
 *  get a specific problem
 */
router.get('/:cid/problem/:pid', function(req, res, next) {

    var cid = req.params.cid;
    var pid = req.params.pid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;
    var notStarted = false;

    async.waterfall([
        function(callback) {
            Contest.getDetailsandProblem(cid,pid,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length) return callback('404');

                if(rows[0].pid === null) return callback('404');

                callback(null,rows[0]);
            });
        },
        function(details,callback) {  //TODO: this can be merge into getDetailsandProblem???

            notStarted = moment().isBefore(details.begin);
            if(notStarted || !isAuthenticated){ return callback(null,details,false); }

            //TODO: check this out after finalize private contest functionality
            //if(!details.privacy){ return callback(null,details,false); } //for private contest

            Contest.isRegistered(cid,user.id,function(err,rows){
                if(err) return callback(err);

                callback(null,details, (rows.length > 0) );
            });
        },
        function(details,registered,callback) {

            if( notStarted || !registered ) return callback(null,details,registered);

            //TODO: add pagination
            Contest.getUserProblemSubmissions(cid,pid,user.id,function(err,rows){
                if(err) return callback(err);

                callback(null,details,registered,rows);
            });
        }
    ], function (error,contest,registered,submissions) {

        if( error ) return next(new Error(error));

        debug(contest);
        debug('res? : ' + registered);
        debug(submissions);

        if( notStarted )
            return res.redirect('/contests/' + cid);

        if( moment().isAfter(contest.end) ){ //ended

            contest = Problems.decodeToHTML(contest);  //TODO: please recheck this
            return res.render('contest/view/problem',{
                active_contest_nav: 'problems',
                active_nav: 'contest',
                isLoggedIn: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                formError: req.flash('formError'),
                contest: contest,
                registered: registered,
                running: false,
                moment: moment
            });
        }

        //TODO: can be merge into one insted of checking ended??

        contest = Problems.decodeToHTML(contest); //TODO: please recheck this
        res.render('contest/view/problem',{
            active_contest_nav: 'problems',
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            errors: req.flash('err'),
            formError: req.flash('formError'),
            contest: contest,
            registered: registered,
            running: true,
            moment: moment,
            submissions: submissions,
            runStatus: MyUtil.runStatus()
        });
    });
});


/**
 *  resistration fot a contest, TODO: may in post request????
 */
router.get('/:cid/resister', isLoggedIn(true), function(req, res, next) {

    var cid = req.params.cid;
    var uid = req.user.id;

    async.waterfall([
        function (callback) {
            Contest.getDetailsIsReg(cid,uid,function(err,rows){
                if(err) return callback(err);

                if(!rows || !rows.length) return callback('404');

                callback(null, parseInt(rows[0].isReg) !== -1 );
            });
        },
        function(isReg,callback) {

            if(isReg) return callback();

            Contest.register(cid,uid,function(err,rows){
                if(err) return callback(err);

                callback();
            });
        }
    ], function (error) {
        if( error ) return next(new Error(error));

        res.redirect('/contests/' + cid);
    });
});



/**
 *  get standings of a contest
 */
router.get('/:cid/standings', function(req, res, next) {

    var cid = req.params.cid;
    var cur_page = req.query.page;

    if( _.isUndefined(cur_page) )
        cur_page = 1;
    else
        cur_page = parseInt(cur_page);

    if( cur_page<1 )
        return next(new Error('what are u looking for!'));

    var URL = url.parse(req.originalUrl).pathname;
    Contest.getRank(cid,cur_page,URL,function(err,contest,problemStats,ranks,pagination){

        if(err) return next(new Error(err));

        debug(contest);
        debug('Begin: ' + moment(contest.begin).format('YYYY-MM-DD HH:mm:ss') );
        debug(ranks);
        debug(problemStats);



        res.render('contest/view/standings',{
            active_contest_nav: 'standings',
            active_nav: 'contest',
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            errors: req.flash('err'),
            contest: contest,
            problemStats: problemStats,
            ranks: ranks,
            running: true,
            moment: moment,
            _: _,
            pagination: pagination
        });
    });
});



/**
 *
 */
router.post('/edit/:cid/problems/:pid/step3', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var cpu = req.body.ftl;
    var memory = req.body.fml;

    if( !cpu || !memory || !MyUtil.isNumeric(cpu) || !MyUtil.isNumeric(memory) ){
        req.flash('error', 'invalid or empty limits, please check again');
        res.redirect('/contests/edit/' + req.params.cid + '/problems/' + req.params.pid + '/step3');
        return;
    }

    if( parseFloat(cpu) < 0.0 || parseFloat(cpu)>5.0 ){
        req.flash('error', 'cpu limit should not be less than zero or greater than 5s');
        res.redirect('/contests/edit/' + req.params.cid + '/problems/' + req.params.pid + '/step3');
        return;
    }

    if( parseInt(memory) < 0.0 || parseInt(memory)>256 ){
        req.flash('error', 'memory limit should not be less than zero or greater than 256mb');
        res.redirect('/contests/edit/' + req.params.cid + '/problems/' + req.params.pid + '/step3');
        return;
    }

    async.waterfall([
        function(callback) {
            Problems.findById(req.params.pid,['id'],function(err,row){
                if( err ) return callback(err);

                if( row.length === 0 ) return callback('404');

                callback();
            });
        },
        function(callback){
            var rootDir = path.normalize(process.cwd() + '/files/tc/p/' + req.params.pid);
            fs.readdir(rootDir, function(err, files) {
                if( err ){
                    if( err.code === 'ENOENT' ) return callback('noTest','Please add test case first');   //no test cases added yet!

                    debug('getTestCases error:: ');
                    debug(err);
                    return callback(err);
                }

                if(!files || files.length === 0)
                    return callback('noTest','Please add test case first');

                callback();
            });
        },
        function(callback) {

            var limits = {
                cpu: parseInt(parseFloat(cpu)*1000.0),
                memory: memory,
                status: 'complete'
            };

            Problems.updateLimits(req.params.pid,limits,function(err,row){
                if(err){
                    debug('Set limit db error');
                    debug(err);
                    return callback(err);
                }
                callback();
            });
        },
        function(callback) {  //TODO: every time changed status to 1, if 2 also turned into 1, please fixed this

            Contest.update({ status: '1' } , req.params.cid, function (err,rows) {
                if(err) return callback(err);

                callback();
            });
        }
    ], function (error, noTest) {

        if( error && !noTest )
            return next(new Error(error));

        if (noTest){
            req.flash('noTestCase', 'Please add at least one test case');
            return res.redirect('/contests/edit/'+ req.params.cid +'/problems/'+ req.params.pid +'/step2');
        }

        res.redirect('/contests/edit/'+ req.params.cid);
    });
});


/**
 *
 */
router.post('/edit/:cid/problems/:pid/step1', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    if( !req.body ) { return next(new Error(err)); }

    Problems.updateContestProblem(req, function(err,row){

        if( err ) return next(new Error(err));

        res.redirect('/contests/edit/'+ req.params.cid +'/problems/'+ req.params.pid +'/step2');
    });
});


/**
 *
 */
router.post('/edit/:cid/problems/:pid/step2', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var uniquename = uuid.v4();
    var saveTo = path.normalize(process.cwd() + '/files/tc/p/' + req.params.pid + '/' + uniquename);
    var namemap = [saveTo + '/i.txt', saveTo + '/o.txt'];

    async.waterfall([
        function(callback) {
            Problems.findById(req.params.pid,['id'],function(err,row){
                if( err ) return callback(err);

                if( row.length === 0 ) return callback('404');

                callback();
            });
        },
        function(callback) {
            mkdirp(saveTo, function (err) {
                if (err) return callback(err);

                debug(namemap[0] + ' created!');
                callback();
            });
        }
    ], function (error) {

        if(error) return next(error);

        var busboy = new Busboy({ headers: req.headers });
        var noFile = 0;
        var fname = 0;

        busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {

            if( noFile || !filename ){
                noFile = 1;
                file.resume();
                return;
            }

            file.pipe(fs.createWriteStream(namemap[fname++]));
        });

        busboy.on('finish', function() {

            if( noFile || fname!==2 ) //clear our created input output files
                return clearUpload( saveTo , req, res );

            req.flash('tcUpSuccess', 'Test Case added!');
            res.redirect('/contests/edit/'+ req.params.cid +'/problems/'+ req.params.pid +'/step2');
        });
        req.pipe(busboy);
    });
});


/**
 *
 */
router.post('/edit/:cid/problems/rtc', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    if( !req.body.pid || !req.body.casename )
        return next(new Error('No Request body found'));

    var TCDir = path.normalize(process.cwd() + '/files/tc/p/' + req.body.pid + '/' + req.body.casename);

    debug('tc to remove ' + TCDir);
    rimraf(TCDir, function (err) {
        if( err ){
            debug(err);
            req.flash('tcRemErr','Something wrong');
        }else{
            req.flash('tcRemSuccess', 'Test Case Removed');
        }
        res.redirect('/contests/edit/'+ req.params.cid +'/problems/'+ req.body.pid +'/step2');
    });
});


/**
 * Add a new problem to a contest
 */
router.post('/edit/:cid/problems/new', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    async.waterfall([
        function(callback) {
            Contest.findById(req.params.cid, function (err,rows) {
                if(err) return next(new Error(err));

                if( rows.length === 0 ) return next(new Error('404, no contest found!'));

                callback();
            });
        },
        function(callback) {
            Problems.insertContestProblem(req, function(err,pid){
                if( err ) return callback(err);

                callback(null,pid);
            });
        },
        function(pid,callback){
            Contest.insertProblem(req.params.cid,pid,function(err,rows){
                if( err ) return callback(err);

                callback(null,pid);
            });
        }
    ], function (error,pid) {
        if( error ) return next(new Error(error));

        res.redirect('/contests/edit/' + req.params.cid + '/problems/' + pid + '/step2');
    });
});


/**
 *  TODO: check it again
 */
router.post('/edit/detail/:cid', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var type = req.body.type;
    var title = req.body.title;
    var beginDate = req.body.beginDate;
    var beginTime = req.body.beginTime;
    var lenDay = req.body.lenDay;
    var lenTime = req.body.lenTime;

    if( _.isUndefined(type) || _.isUndefined(title) || _.isUndefined(beginDate) || _.isUndefined(beginTime) ||
        _.isUndefined(lenDay) || _.isUndefined(lenTime) || !type.length || !title.length || !beginDate.length ||
        !beginTime.length || !lenDay.length || !lenTime.length){

        // debug('type: ' + type + ' title: ' + title + ' beginDate: ' + beginDate);
        // debug('beginTime: ' + beginTime + ' lenDay: ' + lenDay + ' lenTime: ' + lenTime);

        req.flash('err','Invalid or Empty Form');
        res.redirect('/contests/edit/'+req.params.cid);
        return;
    }

    var len = moment(lenTime, 'HH:mm:ss');
    var begin = moment(beginDate + ' ' + beginTime).format('YYYY-MM-DD HH:mm:ss');
    var end = moment(beginDate + ' ' + beginTime).add({
        days: parseInt(lenDay),
        hours: parseInt(len.get('hour')),
        minutes: parseInt(len.get('minute')),
        seconds: parseInt(len.get('second'))
    })
        .format('YYYY-MM-DD HH:mm:ss');

    Contest.update({
        title: title,
        begin: begin,
        end: end,
        privacy: type === 'public' ? 1 : 0
    }, req.params.cid , function(err,rows){

        if(err)
            return next(new Error(err));

        req.flash('success','Updated!');
        res.redirect('/contests/edit/' + req.params.cid);
    });
});


/**
 *  TODO: check it again
 */
router.post('/create', isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    if( !req.body ) return next(new Error('No request body not found!'));

    var type = req.body.type;
    var title = req.body.title;
    var beginDate = req.body.beginDate;
    var beginTime = req.body.beginTime;
    var lenDay = req.body.lenDay;
    var lenTime = req.body.lenTime;

    if( _.isUndefined(type) || _.isUndefined(title) || _.isUndefined(beginDate) || _.isUndefined(beginTime) ||
        _.isUndefined(lenDay) || _.isUndefined(lenTime) || !type.length || !title.length || !beginDate.length ||
        !beginTime.length || !lenDay.length || !lenTime.length){

        req.flash('err','invalid or empty data, please check again');
        res.redirect('/contests/create');
        return;
    }

    var len = moment(lenTime, 'HH:mm:ss');
    var begin = moment(beginDate + ' ' + beginTime).format('YYYY-MM-DD HH:mm:ss');
    var end = moment(beginDate + ' ' + beginTime).add({
        days: parseInt(lenDay),
        hours: parseInt(len.get('hour')),
        minutes: parseInt(len.get('minute')),
        seconds: parseInt(len.get('second'))
    })
        .format('YYYY-MM-DD HH:mm:ss');


    Contest.create({
        title: title,
        begin: begin,
        end: end,
        status: 0,
        privacy: type === 'public' ? 1 : 0
    }, function(err,rows){
        if(err) return next(new Error(err));

        res.redirect('/contests/edit/' + rows.insertId);
    });
});


/**
 *  TODO: add cid and pid in form body???
 */
router.post('/:cid/submit/:pid',isLoggedIn(true) , function(req, res, next) {

    var cid = req.params.cid;
    var uid = req.user.id;

    Contest.findAndisRegistered(cid,uid,function (err,rows) {
        if(err) return next(new Error(err));

        if( rows.length === 0 ) return next(new Error('404'));

        if( !rows[0].resistered ) return next(new Error('401'));

        ContestSubmit.submit(req, res, next);
    });
});



/**
 *
 */
router.post('/:cid/clarifications/delete', isLoggedIn(true), roles.is('admin'),  function(req, res, next) {

    var cid = req.params.cid;
    var clarid = req.body.clar_id;

    debug(req.body);

    var notStarted = false, isEnded = false;
    async.waterfall([
        function(callback) {
            Contest.getDetails(cid, function(err,rows){
                if(err)
                    return callback(err);

                if(!rows.length)
                    return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);
            if( notStarted )
                return callback(null,contest);

            isEnded = moment().isAfter(contest.end);
            if( isEnded )
                return callback(null,contest);

            Contest.deleteClarification(cid, clarid, function (err, rows) {
                    if(err)
                        return callback(err);

                    callback(null,contest);
            });
        }
    ], function (error,contest) {

        if( error )
            return next(new Error(error));

        if( notStarted ){
            req.flash('error','Contest not started yet');
            res.redirect('/contests/' + cid);
            return;
        }

        if( isEnded ){
            req.flash('error','Contest Ended');
            res.redirect('/contests/' + cid);
            return;
        }

        res.redirect('/contests/' + cid + '/clarifications/all');
    });
});


/**
 *
 */
router.post('/:cid/clarifications/respond', isLoggedIn(true), roles.is('admin'),  function(req, res, next) {

    var cid = req.params.cid;
    var clarid = req.body.clar_id;
    var response = req.body.response;
    var ignore = has(req.body,'ignore');

    debug(req.body);

    if( !ignore && (!response || response === '') ){
        req.flash('error','empty response');
        res.redirect('/contests/' + cid + '/clarifications/respond/' + clarid);
        return;
    }

    var notStarted = false, isEnded = false;
    async.waterfall([
        function(callback) {
            Contest.getDetails(cid, function(err,rows){
                if(err)
                    return callback(err);

                if(!rows.length)
                    return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            notStarted = moment().isBefore(contest.begin);
            if( notStarted )
                return callback(null,contest);

            isEnded = moment().isAfter(contest.end);
            if( isEnded )
                return callback(null,contest);

            var updateObj = ignore
                ? { status: 'ignore' , response: '' }
                : { status: 'accepted' , response: response };
            Contest.updateClarification(cid, clarid, updateObj , function (err,rows) {
                if( err )
                    return callback(err);

                callback(null, contest);
            });
        }
    ], function (error,contest) {

        if( error )
            return next(new Error(error));

        if( notStarted ){
            req.flash('error','Contest not started yet');
            res.redirect('/contests/' + cid);
            return;
        }

        if( isEnded ){
            req.flash('error','Contest Ended');
            res.redirect('/contests/' + cid);
            return;
        }

        res.redirect('/contests/' + cid + '/clarifications/all');
    });
});


/**
 * clarification post
 */
router.post('/:cid/clarifications/post',isLoggedIn(true) , roles.is('admin'), function(req, res, next) {

    var problem = req.body.problem;
    var reqText = req.body.request;
    var cid = req.params.cid;

    if( reqText === '' ){
        req.flash('err','empty request');
        res.redirect('/contests/' + cid + '/clarifications/request');
        return;
    }

    var isEnded = false;
    async.waterfall([
        function(callback) {
            Contest.getDetails(cid, function(err,rows){
                if(err)
                    return callback(err);

                if(!rows.length)
                    return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            isEnded = moment().isAfter(contest.end);
            if( isEnded )
                return callback(null,contest);

            if(problem === 'general')
                problem = 0;

            Contest.insertClarification({
                cid: cid,
                pid: problem,
                uid: req.user.id,
                request: reqText,
                response: 'General',
                status: 'general'
            },function(err,rows){
                if(err)
                    return callback(err);

                callback(null,contest);
            });
        }
    ], function (error,contest) {

        if( error )
            return next(new Error(error));

        if( isEnded ){
            req.flash('err','Contest Ended');
            res.redirect('/contests/' + cid);
            return;
        }

        res.redirect('/contests/' + cid + '/clarifications/all');
    });
});




/**
 * clarification request
 */
router.post('/:cid/clarifications/request',isLoggedIn(true) , function(req, res, next) {

    var problem = req.body.problem;
    var reqText = req.body.request;
    var cid = req.params.cid;

    if( reqText === '' ){
        req.flash('err','empty request');
        res.redirect('/contests/' + cid + '/clarifications/request');
        return;
    }

    var notStarted = false, isEnded = false;
    async.waterfall([
        function(callback) {
            Contest.getDetailsIsReg(cid,req.user.id,function(err,rows){
                if(err) return callback(err);

                if(!rows.length) return callback('404');

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            if( parseInt(contest.isReg) === -1 )
                return callback(null,contest);

            notStarted = moment().isBefore(contest.begin);
            if( notStarted )
                return callback(null,contest);

            isEnded = moment().isAfter(contest.end);
            if( isEnded )
                return callback(null,contest);

            if(problem === 'general')
                problem = 0;

            Contest.insertClarification({
                cid: cid,
                pid: problem,
                uid: req.user.id,
                request: reqText,
                status: ''
            },function(err,rows){
                if(err) return callback(err);

                callback(null,contest);
            });
        }
    ], function (error,contest) {

        if( error )
            return next(new Error(error));

        if( contest.isReg === -1 ){
            req.flash('err','You Are Not Participation in This Contest');
            res.redirect('/contests/' + cid);
            return;
        }

        if( notStarted ){
            res.redirect('/contests/' + cid);
            return;
        }

        if( isEnded ){
            req.flash('err','Contest Ended');
            res.redirect('/contests/' + cid);
            return;
        }

        res.redirect('/contests/' + cid + '/clarifications/all');
    });
});


/**
 *
 * @param remDir
 * @param req
 * @param res
 */
var clearUpload = function(remDir,req,res){

    rimraf(remDir, function(error){
        if( error )
            debug(error);
        else
            debug('Cleaned uploaded TC');

        req.flash('tcUpErr', 'Please Select File');
        res.redirect('/contests/edit/'+ req.params.cid +'/problems/'+ req.params.pid +'/step2');
    });
};



module.exports = router;
