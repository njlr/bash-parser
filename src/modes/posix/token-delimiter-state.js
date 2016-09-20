'use strict';
const hasOwnProperty = require('has-own-property');
const tokens = require('../../utils/tokens');
const operators = require('./enums/operators');

const QUOTING = {
	NO: {value: 'NO'},
	ESCAPE: {value: 'ESCAPE'},
	SINGLE: {close: '\'', value: 'SINGLE'},
	DOUBLE: {close: '"', value: 'DOUBLE'},
	PARAMETER: {close: '}', value: 'PARAMETER'},
	BACKTICK_COMMAND: {close: '`', value: 'BACKTICK_COMMAND'},
	COMMAND: {close: ')', value: 'COMMAND'},
	ARITHMETIC: {close: '))', value: 'ARITHMETIC'}
};

const QUOTING_DELIM = {
	'\\': QUOTING.ESCAPE,
	'\'': QUOTING.SINGLE,
	'"': QUOTING.DOUBLE,
	'`': QUOTING.BACKTICK_COMMAND,
	'${': QUOTING.PARAMETER,
	'$(': QUOTING.COMMAND,
	'$((': QUOTING.ARITHMETIC
};

const isOperator = op => hasOwnProperty(operators, op);

const mkLoc = (lineNumber, columnNumber) => ({
	startLine: lineNumber,
	startColumn: columnNumber
});

class TokenDelimiterState {
	constructor(charIterator) {
		this.charIterator = charIterator;
		this.lineNumber = 0;
		this.columnNumber = 0;
		this.prevLineNumber = 0;
		this.prevColumnNumber = 0;
		this.isComment = false;
		this.quoting = QUOTING.NO;
		this.prevQuoting = null;
		this.setEmptyToken();
	}

	isArithmeticExpansionStart(char) {
		return this.quotingCharacter(char) === QUOTING.ARITHMETIC;
	}

	removingLastChar() {
		if (this.token.TOKEN) {
			// remove slash from token
			this.token = tokens.setValue(this.token, this.token.TOKEN.slice(0, -1));

			if (this.token.TOKEN === '') {
				this.setEmptyToken();
			}
		}
	}

	isExpandingCommand() {
		return this.quoting === QUOTING.COMMAND;
	}

	canStartComment(currentCharacter) {
		return currentCharacter === '#';
	}

	canEndComment(currentCharacter) {
		return this.isComment && currentCharacter === '\n';
	}

	canContinueComment(currentCharacter) {
		return this.isComment && currentCharacter !== '\n';
	}

	startComment() {
		this.isComment = true;
	}

	endComment() {
		this.isComment = false;
	}

	canStartQuoting(currentCharacter) {
		return this.quotingCharacter(currentCharacter) && !this.isQuoting();
	}

	setCurrentQuoting(currentCharacter) {
		this.quoting = this.quotingCharacter(currentCharacter);
	}

	canCloseCurrentQuoting(ch) {
		const lastCh = this.charIterator.behind(1);
		const penultCh = this.charIterator.behind(2);
		return (this.quoting.close === ch && lastCh !== '\\') ||
			(this.quoting.close === lastCh + ch && penultCh !== '\\');
	}

	isQuoting() {
		return this.quoting !== QUOTING.NO;
	}

	isQuotingDouble() {
		return this.quoting === QUOTING.DOUBLE;
	}

	isQuotingWord() {
		return this.quoting === QUOTING.SINGLE || this.quoting === QUOTING.DOUBLE;
	}

	resetQuoting() {
		this.quoting = QUOTING.NO;
	}

	setArithmeticQuoting() {
		this.quoting = QUOTING.ARITHMETIC;
	}

	setEscaping() {
		this.quoting = QUOTING.ESCAPE;
		this.prevQuoting = QUOTING.DOUBLE;
	}

	resetEscaping() {
		this.quoting = this.prevQuoting || QUOTING.NO;
		this.prevQuoting = null;
	}

	isEscaping() {
		return this.quoting === QUOTING.ESCAPE;
	}

	setOperatorToken(text) {
		this.token = tokens.mkToken(
			'OPERATOR',
			text,
			mkLoc(this.lineNumber, this.columnNumber)
		);
	}

	setNewLineToken() {
		this.token = tokens.mkToken(
			'NEWLINE',
			'\n',
			mkLoc(this.lineNumber, this.columnNumber)
		);
	}

	setGenericToken(text) {
		this.token = tokens.mkToken(
			'TOKEN',
			text,
			mkLoc(this.lineNumber, this.columnNumber)
		);
	}

	setEmptyToken() {
		this.token = tokens.mkToken(
			'EMPTY',
			true,
			mkLoc(this.lineNumber, this.columnNumber)
		);
	}

	setEOFToken() {
		this.token = tokens.mkToken(
			'EOF',
			true,
			mkLoc(this.prevLineNumber, this.prevColumnNumber)
		);
	}

	savePreviousLoc() {
		this.prevLineNumber = this.lineNumber;
		this.prevColumnNumber = this.columnNumber;
	}

	advanceLoc(currentCharacter) {
		this.savePreviousLoc();
		if (currentCharacter === '\n') {
			this.lineNumber++;
			this.columnNumber = 0;
		} else {
			this.columnNumber++;
		}
	}

	canAppendToOperator(currentCharacter) {
		return this.quoting === QUOTING.NO &&
				isOperator(this.token.OPERATOR + currentCharacter);
	}

	finalizeCurrentToken() {
		Object.assign(this.token.loc, {
			endLine: this.prevLineNumber,
			endColumn: this.prevColumnNumber
		});
		if (!Object.isFrozen(this.token)) {
			this.token._ = {};
			Object.freeze(this.token);
		}

		return this.token;
	}

	currentTokenIsOperatorPart() {
		return this.token.OPERATOR;
	}

	currentTokenIsEmpty() {
		return Boolean(this.token.EMPTY) || this.token.TOKEN === '';
	}

	currentTokenIsGeneric() {
		return Boolean(this.token.TOKEN);
	}

	currentTokenIsCompleteOperator() {
		return isOperator(this.token.OPERATOR);
	}

	appendToOperator(currentCharacter) {
		this.token = tokens.appendTo(this.token, currentCharacter);
	}

	appendToGenericToken(currentCharacter) {
		this.token = tokens.appendTo(this.token, currentCharacter);
	}

	quotingCharacter(ch) {
		const lastCh = this.charIterator.behind(1);
		const penultCh = this.charIterator.behind(2);

		return QUOTING_DELIM[penultCh + lastCh + ch] ||
		QUOTING_DELIM[lastCh + ch] ||
		QUOTING_DELIM[ch];
	}

	isOperatorStart(ch) {
		const lastCh = this.charIterator.behind(1);
		return lastCh !== '$' && '()|&!;<>'.indexOf(ch) !== -1;
	}
}

module.exports = TokenDelimiterState;
