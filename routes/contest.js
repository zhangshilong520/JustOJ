/**
 * Route for home page
 * @type {*|exports|module.exports}
 */

var express     = require('express');
var User        = require('../models/user');
var Contest     = require('../models/contest');
var ContestSubmit     = require('../models/contestSubmit');
var Problems    = require('../models/problems');
var router      = express.Router();

var _           = require('lodash');
var moment      = require("moment");
var async       = require('async');
var path        = require("path");
var fse         = require('fs-extra');
var fs          = require('fs');
var Busboy      = require('busboy');
var uuid        = require('node-uuid');
var rimraf      = require('rimraf');
var MyUtil      = require('../helpers/myutil');
var isLoggedIn  = require('../middlewares/isLoggedIn');
var Paginate    = require('../helpers/paginate');


var Query       = require('../config/database/knex/query');


router.get('/', function(req, res, next) {

    Contest.getPublic(function(err,running,future,ended){
        if(err){ return next(new Error(err)); }


       //console.log(running);
        //console.log(future);
        //console.log(ended);


        res.render('contest/contests',{
            isUser: req.isAuthenticated(),
            user: req.user,
            running: running,
            future: future,
            ended: ended,
            moment: moment
        });
    });

});

router.get('/create', function(req, res, next) {

    res.render('contest/create',{
        isUser: req.isAuthenticated(),
        user: req.user,
        errors: req.flash('err')
    });
});



router.get('/edit', function(req, res, next) {

    Contest.getEditable(function(err,rows){

        if(err){ return next(new Error(err)); }

        console.log(rows);


        res.render('contest/edit/contest_list',{
            isUser: req.isAuthenticated(),
            user: req.user,
            contests: rows,
            moment: moment
        });
    });

});


router.get('/edit/:cid', function(req, res, next) {

    async.waterfall([
        function(callback) {
            Contest.getDetails(req.params.cid,function(err,rows){
                if(err){ return callback(err); }

                callback(null,rows);
            });
        },
        function(details,callback) {
            Contest.getProblems(req.params.cid,function(err,rows){
                if(err){ return callback(err); }

                callback(null,details,rows);
            });
        }
    ], function (error,details,problems) {

        if( error ){ return next(new Error(error)); }

        console.log(details[0]);

        console.log(problems);

        var detail = details[0];
        detail['beginDate'] = moment(detail.begin).format('YYYY-MM-DD');
        detail['beginTime'] = moment(detail.begin).format('HH:mm:ss');


        res.render('contest/edit/edit',{
            isUser: req.isAuthenticated(),
            user: req.user,
            cid: req.params.cid,
            errors: req.flash('err'),
            success: req.flash('success'),
            details: detail,
            problems: problems
        });

    });

});


router.get('/edit/:cid/problems/new', function(req, res, next) {

    res.render('contest/edit/problems/new',{
        isLoggedIn: req.isAuthenticated(),
        user: req.user,
        cid: req.params.cid
    });

});





/**
 *
 */
router.get('/edit/:cid/problems/:pid/preview', function(req, res, next) {

    var cid = req.params.cid;
    var pid = req.params.pid;

    Problems.findById(pid,[],function(err,rows){
        if(err){ return next(new Error(err)) }

        res.send(JSON.stringify(Problems.decodeToHTML(rows[0])));
        res.end();
    });

});


/**
 *
 */
router.get('/edit/:cid/problems/:pid/step1', function(req, res, next) {

    var cid = req.params.cid;
    var pid = req.params.pid;


    Problems.findById(pid,[],function(err,rows){
        if(err){ return next(new Error(err)) }

        console.log(rows);

        res.render('contest/edit/problems/step_1', {
            title: "editproblem | JUST Online Judge",
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


router.get('/edit/:cid/problems/:pid/step2', function(req, res, next) {


    var cid = req.params.cid;
    var pid = req.params.pid;

    async.waterfall([
        function(callback) {

            Problems.findById(pid,['id'],function(err,row){

                if( err ) { return callback(err); }

                if( row.length == 0 ) { return callback('what you r looking for!'); }
                //if( row[0].status == 'incomplete' ) { return callback(new Error('what you r looking for!!!')); }

                callback();

            });

        },
        function(callback){

            var rootDir = path.normalize(process.cwd() + '/files/tc/p/' + pid);
            fs.readdir(rootDir, function(err, files) {

                var empty = [];
                if( err ){

                    if( err.code === 'ENOENT' ){ return callback(null,empty); }

                    console.log('getTestCases error:: ');
                    console.log(err);
                    return callback('getTestCases error');
                }

                if(files){ return callback(null,files); }

                callback(null,empty);
            });
        }
    ], function (error, row) {

        if( error ) { return next(error); }

        res.render('contest/edit/problems/step_2', {
            title: "editproblem | JUST Online Judge",
            locals: req.app.locals,
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            pid: pid,
            cid: cid,
            successMsg: req.flash('tcUpSuccess'),
            errMsg: req.flash('tcUpErr'),
            rsuccessMsg:  req.flash('tcRemSuccess'),
            rerrMsg:  req.flash('tcRemErr'),
            data: row
        });

    });


});




router.get('/edit/:cid/problems/:pid/step3', function(req, res, next) {

    var pid = req.params.pid;
    var cid = req.params.cid;

    Problems.findById(pid,['id'],function(err,row){

        if( err ) { return next(new Error(err)); }

        if( row.length == 0 ) { return next(new Error('what you r looking for!')); }

        res.render('contest/edit/problems/step_3', {
            title: "editproblem | JUST Online Judge",
            locals: req.app.locals,
            isLoggedIn: req.isAuthenticated(),
            user: req.user,
            pid: pid,
            cid: cid,
            error: req.flash('error')
        });

    });

});


router.get('/edit/:cid/publish', function(req, res, next) {

    var cid = req.params.cid;

    Contest.update({'status': 2}, cid, function(err,rows){
        if( err ){ return next(new Error(err)); }


        console.log('Updated');
        res.redirect('/contest/edit');
    });

});


router.get('/:cid', function(req, res, next) {

    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;

    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err){ return callback(err); }

                callback(null,rows[0]);
            });
        },
        function(details,callback) {

            if(!details.privacy){ return callback(null,details,false); }

            if(!isAuthenticated){ return callback(null,details,false); }

            Contest.isRegistered(cid,user.id,function(err,rows){
                if(err){ return callback(err); }

                if(rows.length){
                    return callback(null,details,true);
                }

                callback(null,details,false);
            });
        },
        function(details,registered,callback) {

            //not started yet
            if( moment().isBefore(details.begin) ){ return callback(null,details,registered); }

            var uid = isAuthenticated ? user.id : -1;
            Contest.getDashboardProblems(cid,uid,function(err,rows){
                if(err){ return callback(err); }

                callback(null,details,registered,rows);
            });
        }
    ], function (error,details,registered,problems) {

        if( error ){ return next(new Error(error)); }

        console.log(details);
        console.log('resitered? : ' + registered);
        console.log(problems);

        if( moment().isBefore(details.begin) ){ // not started

            res.render('contest/view/announcement',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: details,
                registered: registered,
                moment: moment
            });

        }else if( moment().isAfter(details.end)  ){ //ended

            res.render('contest/view/dashboard',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: details,
                registered: registered,
                running: false,
                moment: moment,
                problems: problems
            });

        }else{ //running

            res.render('contest/view/dashboard',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: details,
                registered: registered,
                running: true,
                moment: moment,
                problems: problems
            });

        }


    });

});



router.get('/:cid/submissions', function(req, res, next) {

    var cur_page = req.query.page;
    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;


    if( _.isUndefined(cur_page) ){
        cur_page = 1;
    }else{
        cur_page = parseInt(cur_page);
    }

    if( cur_page<1 ) {
        return next(new Error('What you are looking for?'));
    }

    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err){ return callback(err); }

                if(!rows.length){ return callback('No Contest Found'); }

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            //not started yet
            if( moment().isBefore(contest.begin) ){ return callback(null,contest); }


            var sql = Query.select(['submissions.status','submissions.language','submissions.submittime','submissions.cpu','submissions.memory','submissions.pid','users.username','problems.title'])
                .from('contest_submissions as submissions')
                .orderBy('submissions.submittime', 'desc')
                .leftJoin('users', 'submissions.uid', 'users.id')
                .leftJoin('problems', 'submissions.pid', 'problems.id')
                .where('submissions.cid',cid);

            var sqlCount = Query.countDistinct('uid as count')
                .from('contest_submissions')
                .where('cid',cid);

            Paginate.paginate({
                    cur_page: cur_page,
                    sql: sql,
                    limit: 5,
                    sqlCount: sqlCount
                },
                function(err,rows,pagination) {

                    if( err ){ return callback(err); }

                    callback(null,contest,rows,pagination);
                });
        }
    ], function (error,contest,rows,pagination) {


        if( error ){ return next(new Error(error)); }

        if( moment().isBefore(contest.begin) ){ // not started

            res.render('contest/view/announcement',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: contest,
                registered: registered,
                moment: moment
            });

        }else {

            res.render('contest/view/submissions', {
                title: "Problems | JUST Online Judge",
                locals: req.app.locals,
                isUser: isAuthenticated,
                user: user,
                moment: moment,
                status: rows,
                contest: contest,
                runStatus: MyUtil.runStatus(),
                langNames: MyUtil.langNames(),
                pagination: _.isUndefined(pagination) ? {} : pagination
            });
        }

    });

});

router.get('/:cid/submissions/my', function(req, res, next) {

    var cur_page = req.query.page;
    var cid = req.params.cid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;

    if( !isAuthenticated ){
        res.redirect('/login');
        return;
    }

    if( _.isUndefined(cur_page) ){
        cur_page = 1;
    }else{
        cur_page = parseInt(cur_page);
    }

    if( cur_page<1 ) {
        return next(new Error('What you are looking for?'));
    }

    async.waterfall([
        function(callback) {
            Contest.getDetails(cid,function(err,rows){
                if(err){ return callback(err); }

                if(!rows.length){ return callback('No Contest Found'); }

                callback(null,rows[0]);
            });
        },
        function(contest,callback){

            //not started yet
            if( moment().isBefore(contest.begin) ){ return callback(null,contest); }


            var sql = Query.select(['submissions.status','submissions.language','submissions.submittime','submissions.cpu','submissions.memory','submissions.pid','problems.title'])
                .from('contest_submissions as submissions')
                .orderBy('submissions.submittime', 'desc')
                .leftJoin('problems', 'submissions.pid', 'problems.id')
                .where({
                    'submissions.cid': cid,
                    'submissions.uid': user.id
                });

            var sqlCount = Query.count('* as count')
                .from('contest_submissions')
                .where({
                    'cid':cid,
                    'uid':user.id
                });

            Paginate.paginate({
                    cur_page: cur_page,
                    sql: sql,
                    limit: 5,
                    sqlCount: sqlCount
                },
                function(err,rows,pagination) {

                    if( err ){ return callback(err); }

                    callback(null,contest,rows,pagination);
                });
        }
    ], function (error,contest,rows,pagination) {


        if( error ){ return next(new Error(error)); }

        if( moment().isBefore(contest.begin) ){ // not started

            res.render('contest/view/announcement',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: contest,
                registered: registered,
                moment: moment
            });

        }else {

            res.render('contest/view/my_submissions', {
                title: "Problems | JUST Online Judge",
                locals: req.app.locals,
                isUser: isAuthenticated,
                user: user,
                moment: moment,
                status: rows,
                contest: contest,
                runStatus: MyUtil.runStatus(),
                langNames: MyUtil.langNames(),
                pagination: _.isUndefined(pagination) ? {} : pagination
            });
        }

    });

});



router.get('/:cid/problem/:pid', function(req, res, next) {

    var cid = req.params.cid;
    var pid = req.params.pid;
    var isAuthenticated = req.isAuthenticated();
    var user = req.user;

    async.waterfall([
        function(callback) {
            Contest.getDetailsandProblem(cid,pid,function(err,rows){
                if(err){ return callback(err); }

                if(!rows.length){ return callback('No Contest Found'); }

                callback(null,rows[0]);
            });
        },
        function(details,callback) {

            if(!details.privacy){ return callback(null,details,false); }

            if(!isAuthenticated){ return callback(null,details,false); }

            Contest.isRegistered(cid,user.id,function(err,rows){
                if(err){ return callback(err); }

                if(rows.length){
                    return callback(null,details,true);
                }

                callback(null,details,false);
            });
        },
        function(details,registered,callback) {
            //not started yet or not resitered
            if( !registered || moment().isBefore(details.begin) ){ return callback(null,details,registered); }

            Contest.getUserSubmissions(cid,pid,user.id,function(err,rows){
                if(err){ return callback(err); }

                callback(null,details,registered,rows);
            });
        }
    ], function (error,contest,registered,submissions) {

        if( error ){ return next(new Error(error)); }

        console.log(contest);
        console.log('res? : ' + registered);
        console.log(submissions);

        contest = Problems.decodeToHTML(contest);

        if( moment().isBefore(contest.begin) ){ // not started

            res.render('contest/view/announcement',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: contest,
                registered: registered,
                moment: moment
            });

        }else if( moment().isAfter(contest.end)  ){ //ended

            res.render('contest/view/problem',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: contest,
                registered: registered,
                running: false,
                moment: moment
            });

        }else{ //running

            res.render('contest/view/problem',{
                isUser: req.isAuthenticated(),
                user: req.user,
                errors: req.flash('err'),
                contest: contest,
                registered: registered,
                running: true,
                moment: moment,
                submissions: submissions,
                runStatus: MyUtil.runStatus()
            });

        }


    });

});


router.get('/:cid/resister', isLoggedIn(true), function(req, res, next) {

    var cid = req.params.cid;
    var uid = req.user.id;

    async.waterfall([
        function(callback) {
            Contest.isRegistered(cid,uid,function(err,rows){
                if(err){ return callback(err); }

                if(rows.length){
                    return callback(null,true);
                }

                callback(null,false);
            });
        },
        function(isR,callback) {

            if(isR){ return callback(); }

            Contest.register(cid,uid,function(err,rows){
                if(err){ return callback(err); }

                callback();
            });
        }
    ], function (error) {

        if( error ){ return next(new Error(error)); }


        res.redirect('/contest/' + cid);
    });


});


router.get('/:cid/standings', function(req, res, next) {

    var cid = req.params.cid;
    var cur_page = req.query.page;

    if( _.isUndefined(cur_page) ){
        cur_page = 1;
    }else{
        cur_page = parseInt(cur_page);
    }

    if( cur_page<1 ) {
        return next(new Error('what are u looking for!'));
    }

    Contest.getRank(cid,function(err,ranks){

        if(err){ return next(new Error(err)); }


        var problems = JSON.parse('{' + ranks[0].problems + '}');

        console.log( problems );
        console.log( problems['1'] );
        console.log( problems['8'] );


        res.end(JSON.stringify(ranks));

        /*var finalRank = [];

        _.forEach(ranks,function(rank) {

            var tempRank = rank;
            var tempProblems = [];
            var problems = _.split(rank.problems, '-');

            _.forEach(problems,function(problem) {
                tempProblems.push(JSON.parse(problem));
            });

            tempRank.problems = tempProblems;
            finalRank.push(tempRank);
        });

        console.log(JSON.stringify(finalRank));

        res.end(JSON.stringify(finalRank));*/
    });



});



router.post('/edit/:cid/problems/:pid/step3', function(req, res, next) {

    var pid = req.params.pid;
    var cid = req.params.cid;

    async.waterfall([
        function(callback) {

            Problems.findById(pid,['id'],function(err,row){

                if( err ) { return next(new Error(err)); }

                if( row.length == 0 ) { return next(new Error('what you r looking for!')); }

                callback();
            });
        },
        function(callback) {

            var cpu = req.body.ftl;
            var memory = req.body.fml;

            if( cpu && memory &&
                MyUtil.isNumeric(cpu) &&
                MyUtil.isNumeric(memory) ){

                var limits = {
                    cpu: parseInt(parseFloat(cpu)*1000.0),
                    memory: memory
                };

                Problems.updateLimits(pid,limits,function(err,row){

                    if(err){
                        console.log('Set limit db error');
                        console.log(err);
                        return callback(err);
                    }

                    callback();
                });
                return;
            }
            callback({field: 'Invalid Or Empty Field' });
        },
        function(callback){

            Contest.updateProblem({'status':1},pid, function(err,rows){
                if(err){ return callback(err) };

                callback();
            });
        }
    ], function (error, result) {

        if( error ){

            if( error.field ){
                req.flash('error', error.field);
                res.redirect('/contest/edit/'+ cid +'/problems/'+ pid +'/step3');
                return;
            }
            return next(new Error(error));
        }

        res.redirect('/contest/edit/'+ cid);

    });

});


/**
 *
 */
router.post('/edit/:cid/problems/:pid/step1', function(req, res, next) {

    if( !req.body ) { return next(new Error(err)); }

    Problems.updateContestProblem(req, function(err,row){

        if( err ) { return next(new Error( 'Problem Update Error : ' +  err)); }


        res.redirect('/contest/edit/'+ req.params.cid +'/problems/'+ req.params.pid +'/step2');

    });
});



router.post('/edit/:cid/problems/:pid/step2', function(req, res, next) {

    var busboy = new Busboy({ headers: req.headers });
    var uniquename =  uuid.v4();
    var namemap = ['i.txt','o.txt'];
    var noFile = 0;
    var fname = 0;

    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {

        if( noFile || !filename ){
            noFile = 1;
            file.resume();
            return;
        }

        var saveTo = path.normalize(process.cwd() + '/files/tc/p/' + req.params.pid +  '/' + uniquename + '/' + namemap[fname++]);
        file.pipe(fse.createOutputStream(saveTo));
    });

    busboy.on('finish', function() {

        if( noFile || fname!==2 ){
            clearUpload( path.normalize(process.cwd() + '/files/tc/p/' + req.params.pid +  '/' + uniquename) );
            req.flash('tcUpErr', 'Please Select File');
            res.redirect('/ep/' + req.params.pid + '/2');
            return;
        }

        req.flash('tcUpSuccess', 'Test Case added!');
        res.redirect('/contest/edit/'+ req.params.cid +'/problems/'+ req.params.pid +'/step2');

    });

    req.pipe(busboy);

});


router.post('/edit/:cid/problems/rtc', function(req, res, next) {

    if( !req.body.pid || !req.body.casename ){
        return next(new Error('No Request body found'));
    }

    var TCDir =  path.normalize(process.cwd() + '/files/tc/p/' + req.body.pid +  '/' + req.body.casename);

    console.log('tc to remove ' + TCDir);
    rimraf(TCDir, function (err) {
        if( err ){
            console.log(err);
            req.flash('tcRemErr','Something wrong');
        }else{
            req.flash('tcRemSuccess', 'Test Case Removed');
        }
        res.redirect('/contest/edit/'+ req.params.cid +'/problems/'+ req.body.pid +'/step2');
    });

});


/**
 * Add a new problem to a contest
 */
router.post('/edit/:cid/problems/new', function(req, res, next) {


    async.waterfall([
        function(callback) {
            Problems.insertContestProblem(req, function(err,pid){
                if( err ){ return callback(err); }

                callback(null,pid);
            });
        },
        function(pid,callback){
            Contest.insertProblem(req.params.cid,pid,function(err,rows){
                if( err ){ return callback(err); }

                callback(null,pid);
            });
        }
    ], function (error,pid) {

        if( error ){ return next(new Error(error)); }

        res.redirect('/contest/edit/' + req.params.cid + '/problems/' + pid + '/step2');

    });


});



router.post('/edit/detail/:cid', function(req, res, next) {

    var type = req.body.type;
    var title = req.body.title;
    var beginDate = req.body.beginDate;
    var beginTime = req.body.beginTime;
    var lenDay = req.body.lenDay;
    var lenTime = req.body.lenTime;

    if( _.isUndefined(type) || _.isUndefined(title) || _.isUndefined(beginDate) || _.isUndefined(beginTime) ||
        _.isUndefined(lenDay) || _.isUndefined(lenTime) || !type.length || !title.length || !beginDate.length ||
        !beginTime.length || !lenDay.length || !lenTime.length){

       // console.log('type: ' + type + ' title: ' + title + ' beginDate: ' + beginDate);
       // console.log('beginTime: ' + beginTime + ' lenDay: ' + lenDay + ' lenTime: ' + lenTime);

        req.flash('err','Invalid or Empty Form');
        res.redirect('/contest/edit/'+req.params.cid);
        return;
    }

    var len = moment(lenTime, 'HH:mm:ss');
    var begin = moment(beginDate + ' ' + beginTime).format("YYYY-MM-DD HH:mm:ss");
    var end   = moment(beginDate + ' ' + beginTime).add({
        days: parseInt(lenDay),
        hours: parseInt(len.get('hour')),
        minutes: parseInt(len.get('minute')),
        seconds: parseInt(len.get('second'))
    }).format("YYYY-MM-DD HH:mm:ss");


    Contest.update({
        title: title,
        begin: begin,
        end: end,
        privacy: type === 'public' ? 1 : 0
    }, req.params.cid , function(err,rows){

        if(err){
            return next(new Error(err));
        }

        req.flash('success','Updated!');
        res.redirect('/contest/edit/' + req.params.cid);

    });


});


router.post('/create', function(req, res, next) {

    var type = req.body.type;
    var title = req.body.title;
    var beginDate = req.body.beginDate;
    var beginTime = req.body.beginTime;
    var lenDay = req.body.lenDay;
    var lenTime = req.body.lenTime;

    if( _.isUndefined(type) || _.isUndefined(title) || _.isUndefined(beginDate) || _.isUndefined(beginTime) ||
        _.isUndefined(lenDay) || _.isUndefined(lenTime) || !type.length || !title.length || !beginDate.length ||
        !beginTime.length || !lenDay.length || !lenTime.length){

        req.flash('err','Invalid or Empty Form');
        res.redirect('/contest/create');
        return;
    }

    var len = moment(lenTime, 'HH:mm:ss');
    var begin = moment(beginDate + ' ' + beginTime).format("YYYY-MM-DD HH:mm:ss");
    var end   = moment(beginDate + ' ' + beginTime).add({
        days: parseInt(lenDay),
        hours: parseInt(len.get('hour')),
        minutes: parseInt(len.get('minute')),
        seconds: parseInt(len.get('second'))
    }).format("YYYY-MM-DD HH:mm:ss");


    Contest.create({
        title: title,
        begin: begin,
        end: end,
        status: 0,
        privacy: type === 'public' ? 1 : 0
    }, function(err,rows){

        if(err){
            return next(new Error(err));
        }

        res.redirect('/contest/edit/' + rows.insertId);

    });

});


router.post('/:cid/submit/:pid', function(req, res, next) {

    if( !req.isAuthenticated() ){  return next(new Error("I'm not gonna tell you whats going on!"));  }

    ContestSubmit.submit(req, res, next);

});


module.exports = router;
