export type StringFilterSource = string | string[] | RegExp | RegExp[] | (string | RegExp)[]
export class StringFilter
{
	strings: string[]
	regexes: RegExp[]
	constructor(patterns: StringFilterSource)
	{
		let allOrigins = Array.isArray(patterns) ? patterns : [patterns]
		this.strings = allOrigins.filter(origin => typeof origin == "string") as string[]
		this.regexes = allOrigins.filter(origin => typeof origin != "string") as RegExp[]
	}
	match(s: string)
	{
		return this.strings.includes(s) || this.regexes.some(regex => regex.test(s))
	}
	matchWithWildCard(s: string, wildcard = "*")
	{
		return this.strings.includes(wildcard) || this.match(s)
	}
}
