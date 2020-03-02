elizabot-js
===========

Annotated Eliza JS bot based on [this](https://github.com/brandongmwong/elizabot-js) which was based on [this](http://www.masswerk.at/elizabot) and http://en.wikipedia.org/wiki/ELIZA

Usage:

var elizabot = require('./elizabot.js');

elizabot.start()          // initializes eliza and returns a greeting message

elizabot.reply(msgtext)   // returns a eliza-like reply based on the message text passed into it

elizabot.bye()            // returns a farewell message