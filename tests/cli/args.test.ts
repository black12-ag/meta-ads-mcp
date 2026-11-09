import { expect, test } from "vitest";
import { parseToolArgs } from "../../cli/lib/args.mjs";

const schema = {
  type: "object",
  properties: {
    objectId: { type: "string" },
    budgetMinorUnits: { type: "integer" },
    ratio: { type: "number" },
    onlyRunning: { type: "boolean", default: false },
    ids: { type: "array", items: { type: "string" } },
    days: { type: "array", items: { type: "integer" } },
    filters: { type: "object" },
    note: { type: ["string", "null"] },
  },
  required: ["objectId"],
};

function usageError(words: string[]) {
  try {
    parseToolArgs(words, schema);
  } catch (err) {
    return err as { message: string; exitCode: number };
  }
  throw new Error(`expected a usage error for ${words.join(" ")}`);
}

test("flags are typed from the tool's input schema", () => {
  expect(
    parseToolArgs(
      [
        "--objectId",
        "123",
        "--budget-minor-units",
        "2500",
        "--ratio=0.5",
        "--only-running",
        "--ids",
        "a,b",
        "--ids",
        "c",
        "--days",
        "1, 2",
        "--filters",
        '{"status":"ACTIVE"}',
        "--note",
        "hi",
      ],
      schema,
    ),
  ).toEqual({
    objectId: "123",
    budgetMinorUnits: 2500,
    ratio: 0.5,
    onlyRunning: true,
    ids: ["a", "b", "c"],
    days: [1, 2],
    filters: { status: "ACTIVE" },
    note: "hi",
  });
  expect(parseToolArgs(["--objectId", "1", "--onlyRunning=false"], schema)).toEqual({
    objectId: "1",
    onlyRunning: false,
  });
});

test("--input JSON or stdin gives a base that flags override", () => {
  expect(parseToolArgs(["--input", '{"objectId":"1","ratio":2}', "--ratio", "3"], schema)).toEqual({
    objectId: "1",
    ratio: 3,
  });
  const readStdin = () => '{"objectId":"9"}';
  expect(parseToolArgs(["-"], schema, { readStdin })).toEqual({ objectId: "9" });
  expect(parseToolArgs(["--input", "-"], schema, { readStdin })).toEqual({ objectId: "9" });
});

test("shortcut positionals fill named parameters, and an array takes the rest", () => {
  const budget = { positional: ["objectId", "budgetMinorUnits"] };
  expect(parseToolArgs(["123", "2500"], schema, budget)).toEqual({
    objectId: "123",
    budgetMinorUnits: 2500,
  });
  expect(parseToolArgs(["a", "b", "--objectId", "x"], schema, { positional: ["ids"] })).toEqual({
    ids: ["a", "b"],
    objectId: "x",
  });
});

test("bad input is a usage error with exit code 2", () => {
  const cases: Array<[string[], string]> = [
    [["--objectId", "1", "--budgetMinorUnits", "12.5"], "whole number"],
    [["--objectId", "1", "--ratio", "abc"], "a number"],
    [["--objectId", "1", "--onlyRunning=maybe"], "true or false"],
    [["--objectId", "1", "--filters", "[1]"], "JSON object"],
    [["--objectId", "1", "--nope", "x"], "Unknown option --nope"],
    [["--objectId"], "needs a value"],
    [["--ratio", "1"], "Missing --objectId"],
    [["--objectId", "1", "extra"], 'Unexpected argument "extra"'],
    [["--input", "{oops"], "--input must be a JSON object"],
  ];
  for (const [words, message] of cases) {
    const err = usageError(words);
    expect(err.exitCode).toBe(2);
    expect(err.message).toContain(message);
  }
});
