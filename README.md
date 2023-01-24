# 🇹🐓 coq-of-ts

Translate TypeScript code to idiomatic Coq for formal verification (work in progress).

## Input (TypeScript):
```typescript
export function checkIfEnoughCredits(user: User, credits: number): boolean {
  if (user.isAdmin) {
    return credits >= 0;
  }

  return credits >= 1000;
}
```

## Output (Coq):
```coq
Definition checkIfEnoughCredits (user : User) (credits : number) : bool :=
  if user.(User.isAdmin) then
    credits >= 0
  else
    credits >= 1000.
```
