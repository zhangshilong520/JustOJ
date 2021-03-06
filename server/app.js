'use strict';

/**
 * Module dependencies.
 */
var express = require('express');
var path = require('path');
var fs = require('fs');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
//var expressSession = require('express-session');
// var passport = require('passport');
// var flash = require('connect-flash');
var helmet = require('helmet');
var entities = require('entities');
//var cors = require('cors');
var compression = require('compression');
var methodOverride = require('method-override');
var serveStatic = require('serve-static');
var forEach = require('lodash/forEach');
var expressValidator = require('express-validator');
var logger = require('winston');
var nconf = require('nconf');
var chalk = require('chalk');

global.appRequire = function(name) {
  return require(__dirname + '/' + name);
};

//var roles = appRequire('middlewares/userrole');

/**
 * setup env, argv and file configuration
 * Also setup logger
 */
module.exports.setupConfig = function () {

  console.log( chalk.cyan('Loading and setup configs...') );

  nconf
    .argv()
    .env('_');
  global.env = nconf.get('NODE:ENV') || 'development';

  var configPath = path.join(__dirname, 'config/env/' + global.env + '.json');

    //check if config file exists.Otherwise exit node process for security.
    //NOTE: really exit? or use default config somehow??
  if( !fs.existsSync(configPath) ){
    console.log( chalk.bold.red('"' + configPath + '" config file not found.Please check.') );
    process.exit(1);
  }else {
    nconf.file({ file: configPath });
  }

  require('./config/logger'); //init our logger settings
};



/**
 * Load express view engine
 * @param app
 */
module.exports.loadViewEngine = function (app) {
  // app.set('views', path.join(__dirname, 'views'));
  // app.set('view engine', 'ejs');
};


/**
 * Load express Middlewares
 * @param app
 */
module.exports.loadMiddleware = function (app) {

  // app.use(favicon(path.join(__dirname, 'public/static', 'favicon.ico')));

    //stream morgan logger to winston logger
  app.use( morgan('dev', { stream: {
    write: function(message){
      logger.info(message.slice(0, -1));
    }
  }}));

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(methodOverride());
  app.use(expressValidator({
    customValidators: appRequire('config/custom-validator'),
    customSanitizers: {
      escapeInput: entities.encodeHTML
    }
  }));
  app.use(cookieParser());
  app.use(serveStatic(path.join(__dirname, 'public/static')));

  // app.use(expressSession({
  //   secret: nconf.get('SESSION:SECRET') || 'secretisalwayssecret',
  //   resave: false,
  //   saveUninitialized: false
  // }));

  // app.use(passport.initialize());
  // app.use(passport.session());
  // app.use(roles.middleware());
  // app.use(flash());

  //require('./middlewares/passport')(passport);  //authenticate login data
};


/**
 * Load express client routes
 * @param app
 */
module.exports.loadRoutes = function (app) {

  var apiEndpoints = ['signin','signup','problem','submit','contest','user','submission','auth'];

  forEach(apiEndpoints, function(routeName) {
    app.use('/api/' + routeName, require('./controllers/api/' + routeName) );
  });

  // app.get('*', function(req, res) {
  //   res.sendFile(__dirname + '/public/index.html');
  // });

};


/**
 * Load error routes
 * @param app
 */
module.exports.loadErrorRoutes = function (app) {

    // catch 404 and forward to error handler
  // app.use(function(req, res, next) {
  //   var err = new Error('Not Found');
  //   err.status = 404;
  //   next(err);
  // });


  app.use(function (err, req, res, next) {
    //express-jwt authentication
    if (err.name === 'UnauthorizedError'){
      logger.debug(err);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.error(err.name);
    logger.error(err.code);
    logger.error(err.message);
    logger.error(err);


    res.status(500).json({ error: 'Internal Server Error' });
  });



  // csurf error handlers
  // app.use(function (err, req, res, next) {
  //   if (err.code !== 'EBADCSRFTOKEN') return next(err);

  //       // handle CSRF token errors here
  //   res.status(403);
  //   res.send('Session expired');
  // });


    // development error handler
    // will print stacktrace
  // if (global.env === 'development') {
  //   app.use(function(err, req, res, next) {
  //     res.status(err.status || 500);
  //     res.render('error', {
  //       message: err.message,
  //       error: err
  //     });
  //   });
  // }


  //   // production error handler
  //   // no stacktraces leaked to user
  // app.use(function(err, req, res, next) {
  //   res.status(err.status || 500);
  //   res.render('error', {
  //     message: err.message,
  //     error: {}
  //   });
  // });
};


/**
 * Normalize a port into a number, string, or false.
 * @param val
 * @returns {*}
 */
module.exports.normalizePort = function (val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
        // named pipe
    return val;
  }

  if (port >= 0) {
        // port number
    return port;
  }

  return false;
};


/**
 * Create express server based on ssl or not
 * @param app
 */
module.exports.initServer = function (app) {

  global.PORT = this.normalizePort(nconf.get('PORT') || '3000');

  //set port for express app server
  app.set('port', global.PORT);


  // if ( nconf.get('isssl') ) {

    if( !fs.existsSync(nconf.get('ssl:key')) || !fs.existsSync(nconf.get('ssl:cert')) ){
      logger.error('SSL cert file or key file is missing, creating server in non-SSL mode...');
      return require('http').createServer(app);
    }

    var sslCred = {
      key: fs.readFileSync( nconf.get('ssl:key') ),
      cert: fs.readFileSync( nconf.get('ssl:cert') )
    };

    logger.info('creating server in SSL mode....');
    return require('https').createServer(sslCred, app);

  // } else {
  //   logger.warn('creating server in non-SSL mode...');
  //   return require('http').createServer(app);
  // }
};


/**
 * Initialize and load express application, {base function}
 * @returns {*|Function}
 */
module.exports.init = function () {

  var _this = this;

    //setup env ,argv and file configuration , load logger
  _this.setupConfig();

  var app = express();

  app.use(compression());
  app.use(helmet());
  app.use(helmet.hidePoweredBy());
  //app.use(cors());

    //load express view engine
  _this.loadViewEngine(app);

    //load express Middlewares
  _this.loadMiddleware(app);

    //load client default routes
  _this.loadRoutes(app);

    //load express error route
  _this.loadErrorRoutes(app);

    //create express server
  return _this.initServer(app);
};