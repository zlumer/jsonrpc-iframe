export class StringFilter {
    constructor(patterns) {
        let allOrigins = Array.isArray(patterns) ? patterns : [patterns];
        this.strings = allOrigins.filter(origin => typeof origin == "string");
        this.regexes = allOrigins.filter(origin => typeof origin != "string");
    }
    match(s) {
        return this.strings.includes(s) || this.regexes.some(regex => regex.test(s));
    }
    matchWithWildCard(s, wildcard = "*") {
        return this.strings.includes(wildcard) || this.match(s);
    }
}
