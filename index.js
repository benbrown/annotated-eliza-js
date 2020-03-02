const ElizaBot = require('./elizabot.js');

console.log(ElizaBot.start());

console.log(ElizaBot.reply('I am scared of the dark'));
console.log(ElizaBot.reply('I like my old old pants'));
console.log(ElizaBot.reply('I dont recall most of my childhood'));
console.log(ElizaBot.reply('I dreamt that i was a unicorn'));
console.log(ElizaBot.reply('yes! yes! a unicorn.'));

console.log(ElizaBot.reply('xxxx')); // use memory
console.log(ElizaBot.reply('xxxx')); // use memory

console.log(ElizaBot.bye());