
const OP = {
    CALL:   0,
    RET:    1,

    POP:    2,

    NEG:    3,
    ADD:    4,
    SUB:    5,
    MUL:    6,
    DIV:    7,

    NOT:    8,
    LT:     9,
    LE:     10,
    EQ:     11,

    PRINT:    12,

    NIL:    13,
    TRUE:   14,
    FALSE:  15,
    CONST:  16,

    DEF:    17,
    GLD:    18,
    GST:    19,

    LD:     20,
    ST:     21,

    BOX:    22,
    GET:    23,
    SET:    24,
    GETI:   25,
    SETI:   26,
    OF:     27,

    JMP:    28,
    JMPF:   29,
    JNE:    30,
    LOOP:   31,

    EXIT:   32
};

class Chunk {

    constructor() {
        this.code = [];
        this.lines = [];
        this.columns = [];
        this.constants = [];
    }

    emit(byte, line, column) {
        this.code.push(byte);
        this.lines.push(line);
        this.columns.push(column);
    }

    add(value) {
        this.constants.push(value);
        return this.constants.length - 1;
    }
}