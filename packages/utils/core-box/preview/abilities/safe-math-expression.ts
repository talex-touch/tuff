const MAX_EXPRESSION_LENGTH = 240;
const MAX_PARSE_DEPTH = 32;
const MAX_TOKEN_COUNT = 256;

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | {
      type: "punctuator";
      value: "+" | "-" | "*" | "/" | "%" | "^" | "(" | ")" | ",";
    }
  | { type: "eof" };

const CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  e: Math.E,
  pi: Math.PI,
});

const UNARY_FUNCTIONS: Readonly<Record<string, (value: number) => number>> =
  Object.freeze({
    abs: Math.abs,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    ln: Math.log,
    log: Math.log10,
    round: Math.round,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan,
  });

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function isIdentifierStart(char: string | undefined): boolean {
  return (
    char !== undefined &&
    ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z"))
  );
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  const push = (token: Token): boolean => {
    tokens.push(token);
    return tokens.length <= MAX_TOKEN_COUNT;
  };

  while (index < input.length) {
    const char = input[index];
    if (!char) return null;

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    if (isDigit(char) || (char === "." && isDigit(input[index + 1]))) {
      const start = index;
      if (char === ".") {
        index += 1;
      } else {
        while (isDigit(input[index])) index += 1;
        if (input[index] === ".") index += 1;
      }
      while (isDigit(input[index])) index += 1;
      if (input[index] === "e" || input[index] === "E") {
        const exponentStart = index;
        index += 1;
        if (input[index] === "+" || input[index] === "-") index += 1;
        const digitsStart = index;
        while (isDigit(input[index])) index += 1;
        if (digitsStart === index) {
          index = exponentStart;
        }
      }
      const value = Number(input.slice(start, index));
      if (!Number.isFinite(value) || !push({ type: "number", value }))
        return null;
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (isIdentifierStart(input[index])) index += 1;
      if (
        !push({
          type: "identifier",
          value: input.slice(start, index).toLowerCase(),
        })
      ) {
        return null;
      }
      continue;
    }

    if ("+-*/%^(),".includes(char)) {
      if (
        !push({
          type: "punctuator",
          value: char as Extract<Token, { type: "punctuator" }>["value"],
        })
      ) {
        return null;
      }
      index += 1;
      continue;
    }

    return null;
  }

  tokens.push({ type: "eof" });
  return tokens;
}

class SafeMathParser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): number | null {
    const value = this.parseExpression(0);
    return value !== null &&
      this.peek().type === "eof" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  private parseExpression(depth: number): number | null {
    if (depth > MAX_PARSE_DEPTH) return null;
    let value = this.parseTerm(depth + 1);
    if (value === null) return null;

    while (this.matches("+") || this.matches("-")) {
      const operator = this.consumePunctuator();
      const right = this.parseTerm(depth + 1);
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
      if (!Number.isFinite(value)) return null;
    }
    return value;
  }

  private parseTerm(depth: number): number | null {
    let value = this.parseUnary(depth + 1);
    if (value === null) return null;

    while (this.matches("*") || this.matches("/") || this.matches("%")) {
      const operator = this.consumePunctuator();
      const right = this.parseUnary(depth + 1);
      if (right === null) return null;
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
      if (!Number.isFinite(value)) return null;
    }
    return value;
  }

  private parseUnary(depth: number): number | null {
    if (depth > MAX_PARSE_DEPTH) return null;
    if (this.matches("+") || this.matches("-")) {
      const operator = this.consumePunctuator();
      const value = this.parseUnary(depth + 1);
      return value === null ? null : operator === "-" ? -value : value;
    }
    return this.parsePower(depth + 1);
  }

  private parsePower(depth: number): number | null {
    const left = this.parsePrimary(depth + 1);
    if (left === null) return null;
    if (!this.matches("^")) return left;
    this.consumePunctuator();
    const right = this.parseUnary(depth + 1);
    if (right === null) return null;
    const value = left ** right;
    return Number.isFinite(value) ? value : null;
  }

  private parsePrimary(depth: number): number | null {
    if (depth > MAX_PARSE_DEPTH) return null;
    const token = this.peek();

    if (token.type === "number") {
      this.index += 1;
      return token.value;
    }

    if (token.type === "identifier") {
      this.index += 1;
      if (!this.matches("(")) return CONSTANTS[token.value] ?? null;
      this.consumePunctuator();
      const args: number[] = [];
      if (!this.matches(")")) {
        while (true) {
          const arg = this.parseExpression(depth + 1);
          if (arg === null) return null;
          args.push(arg);
          if (!this.matches(",")) break;
          this.consumePunctuator();
          if (args.length >= 2) return null;
        }
      }
      if (!this.matches(")")) return null;
      this.consumePunctuator();
      return this.evaluateFunction(token.value, args);
    }

    if (this.matches("(")) {
      this.consumePunctuator();
      const value = this.parseExpression(depth + 1);
      if (value === null || !this.matches(")")) return null;
      this.consumePunctuator();
      return value;
    }

    return null;
  }

  private evaluateFunction(
    name: string,
    args: readonly number[],
  ): number | null {
    let value: number;
    if (name === "pow" && args.length === 2) {
      value = args[0]! ** args[1]!;
    } else {
      const fn = UNARY_FUNCTIONS[name];
      if (!fn || args.length !== 1) return null;
      value = fn(args[0]!);
    }
    return Number.isFinite(value) ? value : null;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: "eof" };
  }

  private matches(
    value: Extract<Token, { type: "punctuator" }>["value"],
  ): boolean {
    const token = this.peek();
    return token.type === "punctuator" && token.value === value;
  }

  private consumePunctuator(): Extract<Token, { type: "punctuator" }>["value"] {
    const token = this.peek();
    if (token.type !== "punctuator") return ",";
    this.index += 1;
    return token.value;
  }
}

export function evaluateSafeMathExpression(expression: string): number | null {
  const normalized = expression.replace(/×/gu, "*").replace(/÷/gu, "/").trim();
  if (!normalized || normalized.length > MAX_EXPRESSION_LENGTH) return null;
  const tokens = tokenize(normalized);
  if (!tokens) return null;
  return new SafeMathParser(tokens).parse();
}
