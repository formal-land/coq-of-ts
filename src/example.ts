/* Basic definitions */
const b: boolean = false && true,
  n: number = -12 + 23;

const s = 'hi';

const arr = [1, 2, 3];

const cond = b ? 'a' : 'b';

/* Functions */
function id<A>(x: A): A {
  return x;
}

function basicTypes(n: number, m: number): string {
  return 'OK';
}

const r = id(basicTypes(12, 23));

const f = function <A>(x: A, y: A): boolean {
  return true;
};

const arrow = (x: number) => x + 1;

/* Records */
type Rec = {
  a: string;
  b: number;
  c: boolean;
};

const o: Rec = { a: 'hi', b: 12, c: false };

const hi = o.a;

const getHi = (o: Rec) => {
  const { a: hi }: Rec = o;
  return hi;
};

/* Enums */
type Enum = 'aa' | 'bb' | 'gg';

const aa: Enum = 'aa';

function getEnumIndex(e: Enum): number {
  switch (e /* Enum */) {
    case 'aa':
      return 0;
    case 'bb':
      return 1;
    default:
      return 2;
  }
}

/* Algebraic data types */
type Status =
  | {
      type: 'Error';
      message: string;
    }
  | {
      type: 'Loading';
    }
  | {
      type: 'Nothing';
    };

const status: Status = { type: 'Error', message: 'hi' };

function getMessage(status: Status): string {
  switch (status.type /* Status */) {
    case 'Error': {
      const { message } = status;
      return message;
    }
    case 'Loading':
      return 'loading...';
    case 'Nothing':
      return '';
  }
}
