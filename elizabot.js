exports.reply = function (r) {
	if (this.bot == null) {
		this.bot = new ElizaBot(false);
	} 
	return this.bot.transform(r);
}

exports.start = function () {
	if (this.bot == null) {
		this.bot = new ElizaBot(false);
	}
	return this.bot.getInitial();
}

exports.bye = function () {
	if (this.bot == null) {
		this.bot = new ElizaBot(false);
	}
	return this.bot.getFinal();
}

const data = require('./data.js');

function ElizaBot(noRandomFlag) {

	// load welcome messages and goodbye messages
	this.elizaInitials = data.welcome;
	this.elizaFinals = data.goodbyes;

	// load quit command synonyms
	this.elizaQuits = data.quits;

	// load main keywords and trigger phrases
	this.elizaKeywords = data.keywords;

	this.elizaPostTransforms = data.postTransforms;

	this.elizaPres = data.pres;

	this.elizaPosts = data.posts;

	this.elizaSynons = data.synons;

	this.noRandom = (noRandomFlag)? true:false;
	this.capitalizeFirstLetter = true;
	this.debug = false;
	this.memSize = 20;

	this._init();
	this.reset();
}

/** 
 * Reset the bot back to its starting state
 * Re-populate the lastchoice array.
 */
ElizaBot.prototype.reset = function() {
	// reset the bot's memory
	this.mem = [];
	this.lastchoice = [];

	// reset the lastchoice array
	// this is used to track what replies have been used
	// so that the bot won't repeat itself
	for (var k=0; k<this.elizaKeywords.length; k++) {
		this.lastchoice[k]=[];
		var rules = this.elizaKeywords[k][2];
		for (var i=0; i < rules.length; i++) this.lastchoice[k][i] = -1;
	}
}

/**
 * Process the configuration data into usable form
 */
ElizaBot.prototype._init = function() {

	// parse data and convert it from canonical form to internal use
	// prodoce synonym list
	var synPatterns={};

	// make a list of synonyms in the form
	// {
	//		keyword: "(keyword|syn1|syn2|syn3|syn4)",
	//		...
	// }
	if ((this.elizaSynons) && (typeof this.elizaSynons == 'object')) {
		for (var i in this.elizaSynons) synPatterns[i]='('+i+'|'+this.elizaSynons[i].join('|')+')';
	}

	// Convert all the rules in the list to regular expressions.
	// expand synonyms and insert asterisk expressions for backtracking

	// look for patterns like @keyword and expand them using the synonym map
	var sre=/@(\S+)/;

	// look for asterix like "word * word"
	var are=/(\S)\s*\*\s*(\S)/;

	// look for asterix at beginning of string "* word"
	var are1=/^\s*\*\s*(\S)/;

	// look for asterix at the end like "stuff stuff *"
	var are2=/(\S)\s*\*\s*$/;

	// look for astrix just by itself like " * "
	var are3=/^\s*\*\s*$/;

	// check multiple spaces
	var wsre=/\s+/g;

	// loop over all of the rule sets...
	for (var k=0; k<this.elizaKeywords.length; k++) {

		// get a list of all the "decomp" rules.
		var rules = this.elizaKeywords[k][2];

		this.elizaKeywords[k][3] = k; // save original index for sorting

		for (var i=0; i<rules.length; i++) {
			var r = rules[i];

			// r[0] is the pattern, r[1] is a list of responses

			// if r[0] starts with $...
			// check mem flag and store it as decomp's element 2
			if (r[0].charAt(0)=='$') {
				// strip the $ from the front of the string
				r[0] = r[0].replace(/^\$\s*/,'');
				r[2] = true;
			} else {
				r[2] = false;
			}

			// find all @synonyms and replace them with the expanded version
			// @cannot becomes (cannot|can't)
			var m=sre.exec(r[0]);
			while (m) {
				var sp=(synPatterns[m[1]])? synPatterns[m[1]]:m[1];
				r[0]=r[0].substring(0,m.index)+sp+r[0].substring(m.index+m[0].length);
				m=sre.exec(r[0]);
			}

			// replace "*" rule with regular expression capture 
			if (are3.test(r[0])) {
				r[0]='\\s*(.*)\\s*';
			} else {

				// replace "word * word" instances with a regex capture
				m = are.exec(r[0]);
				if (m) {
					var lp='';
					var rp=r[0];
					while (m) {
						lp+=rp.substring(0,m.index+1);
						if (m[1]!=')') lp+='\\b';
						lp+='\\s*(.*)\\s*';
						if ((m[2]!='(') && (m[2]!='\\')) lp+='\\b';
						lp+=m[2];
						rp=rp.substring(m.index+m[0].length);
						m=are.exec(rp);
					}
					r[0]=lp+rp;
				}

				// replace "* word" instances with a regex
				m = are1.exec(r[0]);
				if (m) {
					var lp='\\s*(.*)\\s*';
					if ((m[1]!=')') && (m[1]!='\\')) lp+='\\b';
					r[0]=lp+r[0].substring(m.index-1+m[0].length);
				}

				// replace "word *" instances with a regex
				m = are2.exec(r[0]);
				if (m) {
					var lp = r[0].substring(0,m.index+1);
					if (m[1] != '(') lp+='\\b';
					r[0] = lp+'\\s*(.*)\\s*';
				}

			}

			// translate spaces into \s pattern
			r[0] = r[0].replace(wsre, '\\s+');

			// reset the search index for the pattern
			// not sure this is 100% necessary...
			wsre.lastIndex=0;
		}
	}

	// now sort keywords by rank (highest first)
	this.elizaKeywords.sort(this._sortKeywords);

	// and compose regexps and refs for pres and posts
	ElizaBot.prototype.pres = {};
	ElizaBot.prototype.posts = {};

	// Create an expression that matches the `pres`
	var a = new Array();
	for (var i = 0; i < this.elizaPres.length; i+=2) {
		a.push(this.elizaPres[i]);
		ElizaBot.prototype.pres[this.elizaPres[i]]=this.elizaPres[i+1];
	}
	ElizaBot.prototype.preExp = new RegExp('\\b('+a.join('|')+')\\b');

	// Create an expression that matches the `posts`
	var a=new Array();
	for (var i=0; i<this.elizaPosts.length; i+=2) {
		a.push(this.elizaPosts[i]);
		ElizaBot.prototype.posts[this.elizaPosts[i]]=this.elizaPosts[i+1];
	}
	ElizaBot.prototype.postExp = new RegExp('\\b('+a.join('|')+')\\b');

	// done
	ElizaBot.prototype._dataParsed=true;
}

ElizaBot.prototype._sortKeywords = function(a,b) {
	// sort by rank
	if (a[1]>b[1]) return -1
	else if (a[1]<b[1]) return 1
	// or original index
	else if (a[3]>b[3]) return 1
	else if (a[3]<b[3]) return -1
	else return 0;
}

ElizaBot.prototype.transform = function(text) {
	var rpl='';

	// Normalize the input...
	text=text.toLowerCase();

	// remove most punctuation and non-alpha chars and replace with a space
	text=text.replace(/@#\$%\^&\*\(\)_\+=~`\{\[\}\]\|:;<>\/\\\t/g, ' ');

	// Make it easier to split the text into sentence-like chunks.
	// replace hyphens with a period
	text=text.replace(/\s+-+\s+/g, '.');
	// replace comma, end of sentence punctuation with a period
	text=text.replace(/\s*[,\.\?!;]+\s*/g, '.');
	// replace the word "but" with a period.
	text=text.replace(/\s*\bbut\b\s*/g, '.');

	// replace multiple spaces with a single space
	text=text.replace(/\s{2,}/g, ' ');

	// Now, split the text into sentence-like chunks and loop through them
	var parts = text.split('.');

	for (var i = 0; i < parts.length; i++) {
		var part = parts[i];
		if (part != '') {
			// Check to see if the user has sent a quit request.
			// If so, quit and send the last message.
			for (var q = 0; q < this.elizaQuits.length; q++) {
				if (this.elizaQuits[q] == part) {
					// reset bot's memory
					this.reset();
					return this.getFinal();
				}
			}

			// Continue to normalize the text...
			// this time replacing any of the "pre" phrases
			// so like "recollect" becomes "remember"
			var m = this.preExp.exec(part);
			if (m) {
				var lp = '';
				var rp = part;
				while (m) {
					lp += rp.substring(0, m.index) + this.pres[m[1]];
					rp = rp.substring(m.index + m[0].length);
					m = this.preExp.exec(rp);
				}
				part = lp + rp;
			}

			this.sentence = part;

			// loop through keywords
			for (var k = 0; k < this.elizaKeywords.length; k++) {
				// check to see if the main keyword is present...
				// and if so, execute that rule.
				if (part.search(new RegExp('\\b' + this.elizaKeywords[k][0] + '\\b', 'i'))>=0) {
					rpl = this._execRule(k);
				}

				// if the rule returned a response, use it!
				// otherwise, keep looking for a hit...
				if (rpl != '') return rpl;
			}
		}
	}

	// No matching keywords were found.
	// Consult the memory of previous responses
	// and use that instead
	rpl = this._memGet();

	// If nothing in memory, 
	// pull out the xnone rule which services as a fallback.
	if (rpl == '') {
		this.sentence=' ';
		var k = this._getRuleIndexByKey('xnone');
		if (k >= 0) rpl = this._execRule(k);
	}

	// Return reply or default string
	return (rpl!='')? rpl : 'I am at a loss for words.';
}

ElizaBot.prototype._execRule = function(k) {
	// pull the specific rule out of the list.
	var rule = this.elizaKeywords[k];

	// get a list of variants or "decompositions" 
	var decomps = rule[2];

	// for ech of the variants....
	for (var i = 0; i < decomps.length; i++) {

		// test to see if the decomposition pattern matches
		var m = this.sentence.match(decomps[i][0]);

		if (m != null) {
			// get the list of possible replies
			var replies = decomps[i][1];

			var memflag = decomps[i][2];

			// pick a response.
			// if noRandom is set, start with 0
			// otherwise, pick randomly
			var ri = this.noRandom ? 0 : Math.floor(Math.random() * replies.length);

			// make sure the same response is not used twice in a row.
			if (
				// if noRandom is on AND this rule has already been triggered
				(this.noRandom && (this.lastchoice[k][i] > ri)) || 
				// or the last used phrase is the same randomly picked one
				(this.lastchoice[k][i] == ri)
			) {
				// use the next one in the list...
				ri = ++this.lastchoice[k][i];

				// unless we run out of them, in which case...
				if (ri >= replies.length) {
					// start at the beginning again
					ri = 0;

					// and reset the used flag to -1 which will let it start again
					// from 0
					this.lastchoice[k][i] = -1;
				}
			} else {
				// capture which response was used last for this rule.
				this.lastchoice[k][i] = ri;
			}

			// pluck the semi-random reply we chose.
			var rpl=replies[ri];

			if (this.debug) console.debug('match:\nkey: '+this.elizaKeywords[k][0]+
				'\nrank: '+this.elizaKeywords[k][1]+
				'\ndecomp: '+decomps[i][0]+
				'\nreasmb: '+rpl+
				'\nmemflag: '+memflag);

			// allow for a simple goto command which will replace this rule with another
			if (rpl.search('^goto ', 'i') == 0) {
				ki = this._getRuleIndexByKey(rpl.substring(5));
				if (ki >= 0) return this._execRule(ki);
			}

			// pattern to back-references in the reply like "You said you love your (2)"
			// these refer to the *s in the original pattern which are captured and extracted
			var backreference = /\(([0-9]+)\)/;

			var m1 = backreference.exec(rpl);
			if (m1) {
				var lp = '';
				var rp = rpl;
				while (m1) {
					// m1[1] is the number inside the ()s
					// use this to grab the value from the original match m[x]
					var param = m[parseInt(m1[1])];

					// process the parameter value with the `posts`
					// this replaces things like i=>you, am=> are and your=>my
					// basically reflecting the language
					var m2 = this.postExp.exec(param);
					if (m2) {
						var lp2 = '';
						var rp2 = param;
						while (m2) {
							// replace the original version with the regular expression
							lp2 += rp2.substring(0,m2.index) + this.posts[m2[1]];
							rp2 = rp2.substring(m2.index + m2[0].length);

							// test the remainder of the string to see if we need to do it again...
							m2 = this.postExp.exec(rp2);
						}
						param = lp2 + rp2;
					}
					
					// reconstruct the reply with the reflected value
					lp += rp.substring(0,m1.index) + param;
					rp = rp.substring(m1.index + m1[0].length);

					// test if there are any more back references
					m1 = backreference.exec(rp);
				}
		
				// reconstruct the replay
				rpl = lp + rp;
			}

			// clean up output
			rpl = this._postTransform(rpl);
			
			if (memflag) {
				// if this is a memory rule (indicated by $ at beginning)
				// then save this for later, rather than sending it now
				// and let another rule try to fire...
				this._memSave(rpl)
			} else {
				return rpl;
			}
		} // if this rule matched
	} // for each rule
	return '';
}

/**
 * apply a series of transforms to the final output
 */
ElizaBot.prototype._postTransform = function(s) {
	// final cleanings

	// replace double spaces with a single space
	s = s.replace(/\s{2,}/g, ' ');

	// remove spaces at the end of a sentence
	s = s.replace(/\s+\./g, '.');

	// apply transforms
	for (var i = 0; i < this.elizaPostTransforms.length; i += 2) {
		s = s.replace(this.elizaPostTransforms[i], this.elizaPostTransforms[i+1]);
		this.elizaPostTransforms[i].lastIndex = 0;
	}

	// capitalize first char
	if (this.capitalizeFirstLetter) {
		var re = /^([a-z])/;
		var m = re.exec(s);
		if (m) s = m[0].toUpperCase() + s.substring(1);
	}

	return s;
}

ElizaBot.prototype._getRuleIndexByKey = function(key) {
	for (var k=0; k<this.elizaKeywords.length; k++) {
		if (this.elizaKeywords[k][0]==key) return k;
	}
	return -1;
}

ElizaBot.prototype._memSave = function(t) {
	this.mem.push(t);
	if (this.mem.length > this.memSize) this.mem.shift();
}

/**
 * Get a reply out of memory
 * Picks one randomly
 */
ElizaBot.prototype._memGet = function() {
	if (this.mem.length) {
		// if noRandom, pick oldest
		if (this.noRandom) {
			return this.mem.shift();
		} else {
			// otherwise, pick a random one and shift everything else down
			var n = Math.floor(Math.random()*this.mem.length);
			var rpl = this.mem[n];
			// this is basically moving things down
			// should maybe just use splice or something!
			for (var i = n+1; i < this.mem.length; i++) {
				this.mem[i-1] = this.mem[i];
			}

			return rpl;

		}
	} else {
		return '';
	}
}

ElizaBot.prototype.getFinal = function() {
	if (!this.elizaFinals) return '';
	return this.elizaFinals[Math.floor(Math.random()*this.elizaFinals.length)];
}

ElizaBot.prototype.getInitial = function() {
	if (!this.elizaInitials) return '';
	return this.elizaInitials[Math.floor(Math.random()*this.elizaInitials.length)];
}