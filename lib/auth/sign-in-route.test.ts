import { describe, it, expect } from "vitest";
import { routeForSignIn } from "./sign-in-route";

// The branch behind the two-step sign-in dialog. It is a pure function for one
// reason: the ordering trap below is invisible in a rendered page and shows up
// only on somebody else's machine.

describe("routeForSignIn", () => {
  it("sends an address that has a password to the password field", () => {
    expect(
      routeForSignIn({ hasPassword: true, demoLogin: false, mailConfigured: true }),
    ).toBe("password");
  });

  it("mails a link to an address without one", () => {
    expect(
      routeForSignIn({ hasPassword: false, demoLogin: false, mailConfigured: true }),
    ).toBe("link");
  });

  it("signs a passwordless address straight in when demo mode is on", () => {
    expect(
      routeForSignIn({ hasPassword: false, demoLogin: true, mailConfigured: false }),
    ).toBe("demo");
  });

  it("STILL asks for the password in demo mode when the address has one", () => {
    // The regression this whole function exists to prevent. Writing the demo
    // check first is the obvious shape, and it silently makes every password
    // set on a demo machine unusable — which is exactly what the comment in
    // app/login/page.tsx warned about before this story rewrote it.
    expect(
      routeForSignIn({ hasPassword: true, demoLogin: true, mailConfigured: false }),
    ).toBe("password");
  });

  it("refuses when the address has no password and nothing can send a link", () => {
    // Not a form that submits into nothing: the caller has a case to name.
    expect(
      routeForSignIn({ hasPassword: false, demoLogin: false, mailConfigured: false }),
    ).toBe("none");
  });

  it("prefers the password even when mail is off and demo mode is off", () => {
    expect(
      routeForSignIn({ hasPassword: true, demoLogin: false, mailConfigured: false }),
    ).toBe("password");
  });

  it("never answers 'none' for an address that has a password", () => {
    // An account with a password always has a way in, whatever else is
    // configured — there is no combination that locks one out.
    for (const demoLogin of [true, false]) {
      for (const mailConfigured of [true, false]) {
        expect(routeForSignIn({ hasPassword: true, demoLogin, mailConfigured })).not.toBe(
          "none",
        );
      }
    }
  });
});
