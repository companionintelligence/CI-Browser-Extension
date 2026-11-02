import { friendlyError } from "./friendlyErrors";

describe("friendlyError", () => {
  it("says the Memory is unreachable for a gateway or origin outage", () => {
    const unreachable =
      "Your Memory is unreachable right now. It will be retried automatically.";

    expect(
      friendlyError(
        "Failed to create device (HTTP 530): Request failed with status code 530",
      ),
    ).toBe(unreachable);
    expect(
      friendlyError(
        "CI-Server https://memory.example/api/v1/browser-activity failed: HTTP 503",
      ),
    ).toBe(unreachable);
  });

  it("keeps the rejection and refusal wording for registration failures", () => {
    expect(
      friendlyError("Failed to create device (HTTP 401): Unauthorized"),
    ).toBe(
      "Your Memory rejected this account's sign-in. It may be running an older version.",
    );
    expect(
      friendlyError("Failed to create device (HTTP 500): Server error"),
    ).toBe("Your Memory refused to register this browser.");
  });
});
