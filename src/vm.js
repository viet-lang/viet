const STATUS = {
    OK: 0,
    COMPILE_ERROR: 1,
    RUNTIME_ERROR: 2
};

const Message = {
    binopError: function(op, a, b) {
        return `Chỉ có thể thực hiện phép ${op} giữa hai số, ` +
            `không chấp nhận kiểu '${VM.typeName(a)}' với '${VM.typeName(b)}'.`;
    },
    binAddError: function(a, b) {
        return `Chỉ có thể thực hiện phép cộng giữa hai số hoặc chuỗi và bất kỳ kiểu nào, ` +
            `không chấp nhận kiểu '${VM.typeName(a)}' với '${VM.typeName(b)}'.`;
    },
    unopError: function(op, a) {
        return `Chỉ có thể thực hiện phép ${op} của một số, ` +
            `không chấp nhận kiểu '${VM.typeName(a)}'.`;
    },
    undefinedError: function(name) {
        return `Biến '${name}' chưa được khai báo.`;
    },
    invalidCall: function(a) {
        return `Chỉ có thể gọi được hàm, không chấp nhận kiểu '${VM.typeName(a)}'.`;
    },
    stackOverflow: function() {
        return `Tràn ngăn xếp!`;
    },
    wrongArgc: function(expected, got) {
        return `Hàm có ${expected} tham số, nhưng truyền vào là ${got}.`;
    },
    properError: function(name) {
        return `Thuộc tính '${name}' chưa được định nghĩa.`;
    },
    accessError: function(a) {
        return `Chỉ có thể truy cập thuộc tính trong hộp, không chấp nhận kiểu '${VM.typeName(a)}'.`;
    },
    subscriptError: function(a) {
        return `Chỉ có thể truy cập vị trí trong hộp, không chấp nhận kiểu '${VM.typeName(a)}'.`;
    },
    indexError: function(a) {
        return `Vị trí phải là một số, không chấp nhận kiểu '${VM.typeName(a)}'.`;
    },
};

class VM
{
    static MAX_FRAMES = 64;
    static MAX_STACK = VM.MAX_FRAMES * 256;

    constructor()
    {
        this.stack = [];
        this.frames = [];
        this.globals = {};

        for (var i = 0; i < VM.MAX_STACK; i++)
            this.stack.push(null);

        for (var i = 0; i < VM.MAX_FRAMES; i++) {
            this.frames.push({
                pc: 0,
                func: null,
                top: 0
            });
        }
        
        this.resetStack();
    }

    resetStack() {
        this.sp = 0;
        this.frameCount = 0;
    }

    runtimeError(message) {

        console.log('Lỗi: ' + message);   

        for (var i = this.frameCount - 1; i >= 0; i--) {                 
            var frame = this.frames[i];                            
            var func = frame.func;                     
            // -1 because the IP is sitting on the next instruction to be
            // executed.  
            var line = func.chunk.lines[frame.pc];
            var column = func.chunk.columns[frame.pc];                                            
            var str =`[dòng ${line}:${column}] trong `;

            if (func.name == null) {                                
                str += "script.";                               
            } else {                                                     
                str += "hàm " + func.name + '().';          
            }

            console.log(str);
        }

        this.resetStack();
        return STATUS.RUNTIME_ERROR;
    }

    readByte() {
        var frame = this.frames[this.frameCount-1];
        return frame.func.chunk.code[frame.pc++];
    }

    readWord() {
        var frame = this.frames[this.frameCount-1];
        frame.pc += 2;
        return (frame.func.chunk.code[frame.pc-2] << 8) |
            frame.func.chunk.code[frame.pc-1];
    }

    readConst() {
        var frame = this.frames[this.frameCount-1];
        return frame.func.chunk.constants[
            frame.func.chunk.code[frame.pc++]];
    }

    push(value) {      
        this.stack[this.sp++] = value;
    }

    pop() {
        return this.stack[--this.sp];
    }

    peek(i) {
        return this.stack[this.sp - 1 - i];
    }

    call(func, argCount)
    {
        if (argCount != func.arity) {                   
            this.runtimeError(Message.wrongArgc(func.arity, argCount));                    
            return false;                                      
        }

        if (this.frameCount == VM.MAX_FRAMES) {             
            this.runtimeError(Message.stackOverflow());             
            return false;                                
        }

        var frame = this.frames[this.frameCount++];      
        frame.func = func;                          
        frame.pc = 0;
      
        frame.top = this.sp - argCount - 1;           
        return true;                                         
    }

    callValue(callee, argCount) {
        if (callee != null) {
            if (Fun.is(callee)) {                                                      
                return this.call(callee, argCount);
            }
            else if (typeof(callee) == 'function') {
                this.sp -= argCount + 1;
                var result = callee.apply(null,
                    this.stack.slice(this.sp+1, this.sp+argCount+1));               
                this.push(result);
                return true;
            }
        }
        
        // Non-callable object type.
        this.runtimeError(Message.invalidCall(callee));
        return false;
    }

    execute()
    {
        var frame = this.frames[this.frameCount - 1];

        for(;;) switch(this.readByte()) {

            case OP.PRINT: {
                var value = this.pop();
                console.log(VM.valueToString(value));
                continue;
            }

            case OP.POP: {
                this.pop();
                continue;
            }

            case OP.CALL: {                              
                var argCount = this.readByte();
              
                if (!this.callValue(this.peek(argCount), argCount)) {
                    return STATUS.RUNTIME_ERROR;          
                }       
                frame = this.frames[this.frameCount - 1];                                   
                continue;                                     
            }
            case OP.RET: {
                var result = this.pop();

                this.frameCount--;                      
                if (this.frameCount == 0) {             
                    this.pop();                              
                    return STATUS.OK;                
                }                                     

                this.sp = frame.top;
                this.push(result);

                frame = this.frames[this.frameCount - 1];
                continue;
            }

            case OP.NEG: {
                if (typeof(this.peek(1)) == 'number') {
                    this.push(-this.pop());
                    continue;
                }            
                return this.runtimeError(Message.unopError('lấy âm', this.peek(0)));
            }
            case OP.ADD: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number')  {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a + b);
                    continue;
                }
                else if (typeof(this.peek(1) == 'string')) {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a + VM.valueToString(b));
                    continue;
                }
                else if (typeof(this.peek(0) == 'string')) {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(VM.valueToString(a) + b);
                    continue;
                }
                return this.runtimeError(Message.binAddError(this.peek(1), this.peek(0)));
            }
            case OP.SUB: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a - b);
                    continue;
                }
                return this.runtimeError(Message.binopError('trừ', this.peek(1), this.peek(0)));
            }
            case OP.MUL: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a * b);
                    continue;
                }
                return this.runtimeError(Message.binopError('nhân', this.peek(1), this.peek(0)));
            }
            case OP.DIV: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a / b);
                    continue;
                }
                return this.runtimeError(Message.binopError('chia', this.peek(1), this.peek(0)));
            }
            
            case OP.NOT: {
                this.push(!this.pop());
                continue;
            }
            case OP.LT: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a < b);
                    continue;
                }
                return this.runtimeError(Message.binopError('so sánh bé hơn', this.peek(1), this.peek(0)));
            }
            case OP.LE: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a <= b);
                    continue;
                }
                return this.runtimeError(Message.binopError('so sánh bé hơn/bằng', this.peek(1), this.peek(0)));
            }
            case OP.GT: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a > b);
                    continue;
                }
                return this.runtimeError(Message.binopError('so sánh lớn hơn', this.peek(1), this.peek(0)));
            }
            case OP.GE: {
                if (typeof(this.peek(1)) == 'number' && typeof(this.peek(0)) == 'number') {
                    var b = this.pop();
                    var a = this.pop();
                    this.push(a >= b);
                    continue;
                }
                return this.runtimeError(Message.binopError('so sánh lớn hơn/bằng', this.peek(1), this.peek(0)));
            }
            case OP.EQ: {
                var b = this.pop();
                var a = this.pop();
                this.push(a == b);
                continue;
            }

            case OP.NIL: {
                this.push(null);
                continue;
            }
            case OP.TRUE: {
                this.push(true);
                continue;
            }
            case OP.FALSE: {
                this.push(false);
                continue;
            }
            case OP.CONST: {
                this.push(this.readConst());
                continue;
            }

            
            case OP.DEF: {  // Define global: [k] [-1, +0]
                var name = this.readConst();
                this.globals[name.toLowerCase()] = this.pop();
                continue;
            }
            case OP.GLD: { // Get global: [k] [-0, +1]
                var name = this.readConst();
                var value = this.globals[name.toLowerCase()];
                if (value === undefined) value = null;
                this.push(value);
                continue;
            }
            case OP.GST: { // Set global: [k] [-0, +0]
                var name = this.readConst();
                this.globals[name.toLowerCase()] = this.peek(0);
                continue;
            }

            case OP.LD: { // Get local: [i] [-0, +1]
                var slot = this.readByte();
                this.push(this.stack[frame.top + slot]);
                continue;
            }
            case OP.ST: { // Set local: [i] [-0, +0]
                var slot = this.readByte();
                this.stack[frame.top + slot] = this.peek(0);  
                continue;
            }

            case OP.JMP: {
                var offset = this.readWord();
                frame.pc += offset;
                continue;
            }
            case OP.JMPF: {
                var offset = this.readWord();
                if (!this.peek(0)) frame.pc += offset;
                continue;
            }
            case OP.LOOP: {
                var offset = this.readWord();
                frame.pc -= offset;
                continue;
            }

            case OP.BOX: {
                var count = this.readByte();
                var box = new Box();

                for (var i = count-1; i >= 0; i--) {
                    box.list.push(this.peek(i));
                }

                this.sp -= count;
                this.push(box);
                continue;
            }

            case OP.GET: {
                if (Box.is(this.peek(0))) {
                    var box = this.peek(0);
                    var name = this.readConst();
                    var value = box.get(name);
                   
                    if (value === undefined)
                        return this.runtimeError(Message.properError(name));

                    this.pop();
                    this.push(value);
                    continue;
                }
                return this.runtimeError(Message.accessError(this.peek(0)));
            }
            case OP.SET: {
                if (Box.is(this.peek(1))) {
                    var box = this.peek(1);
                    var name = this.readConst();
                    var value = this.peek(0);

                    box.set(name, value);
                    this.pop();
                    this.pop();
                    this.push(value);
                    continue;
                }
                
                return this.runtimeError(Message.accessError(this.peek(1)));
            }

            case OP.GETI: {
                if (Box.is(this.peek(1))) {
                    if (typeof(this.peek(0)) == 'number') {
                        var box = this.peek(1);
                        var index = this.peek(0);
                        var value = box.geti(index);
            
                        this.pop();
                        this.pop();
                        this.push(value);
                        continue
                    }
                    else if (typeof(this.peek(0)) == 'string') {
                        var box = this.peek(1);
                        var index = this.peek(0);
                        var value = box.get(index);

                        if (value === undefined)
                            return this.runtimeError(Message.properError(index));
            
                        this.pop();
                        this.pop();
                        this.push(value);
                        continue;
                    }
                    
                    return this.runtimeError(Message.indexError(this.peek(0)));
                }
                return this.runtimeError(Message.subscriptError(this.peek(1)));
            }
            case OP.SETI: {
                if (Box.is(this.peek(2))) {
                    if (typeof(this.peek(1)) == 'number') {
                        var box = this.peek(2);
                        var index = this.peek(1);
                        var value = this.pop();
                        
                        box.seti(index, value);
                        this.pop();
                        this.pop();
                        this.push(value);
                        continue;
                    }
                    else if (typeof(this.peek(1)) == 'string') {
                        var box = this.peek(2);
                        var index = this.peek(1);
                        var value = this.pop();
                        
                        box.set(index,value);
                        this.pop();
                        this.pop();
                        this.push(value);
                        continue;
                    }
                    
                    return this.runtimeError(Message.indexError(this.peek(1)));
                }
                return this.runtimeError(Message.subscriptError(this.peek(2)));
            }

            case OP.OF: {
                if (Box.is(this.peek(0))) {
                    if (typeof(this.peek(1)) == 'string') {
                        var box = this.peek(0);
                        var index = this.peek(1);
                        var value = box.get(index);

                        if (value === undefined)
                            return this.runtimeError(Message.properError(index));
                        
                        this.pop();
                        this.pop();
                        this.push(value);
                        continue;
                    }
                    else {
                        return this.runtimeError(Message.indexError(this.peek(1)));
                    }
                }
                return this.runtimeError(Message.subscriptError(this.peek(0)));
            }

            case OP.EXIT: {
                this.resetStack();
                return STATUS.OK;
            }
        }
    }

    interpret(source)
    {
        var parser = new Parser(source);

        var func = parser.compile();
        if (func == null) return STATUS.COMPILE_ERROR;

        this.push(func); 
        this.callValue(func, 0);

        return this.execute();
    }

    static typeName(value) {
        if (value == null) return 'rỗng';
        switch (typeof(value)) {      
            case 'boolean': return 'logic';
            case 'number':  return 'số';
            case 'string':  return 'chuỗi';
            case 'object': {
                var con = value.constructor;
                if (con) {
                    if (con.name == 'Fun')
                            return 'hàm';
                    else if (con.name == 'box')
                            return 'hộp';
                }
            } default:
            case 'undefined': 
                            return 'rỗng';
        }
    }

    static valueToString(value, strm = false) {
        if (value == null) return 'rỗng';
        switch (typeof(value)) {
            case 'boolean': return value ? 'đúng' : 'sai';
            case 'number':  return value.toString();
            case 'string':  return strm ? ('`' + value + '`') : value;
            case 'object': {
                var con = value.constructor;
                if (con) {
                    if (con.name == 'Fun') {
                        return value.name ? ('hàm: ' + value.name) :
                            '<script>';
                    }
                    else if (con.name == 'Box') {
                        var list = value.list;
                        var str = '';
                        for (var i=0; i<list.length; i++) {
                            str += VM.valueToString(list[i], true);
                            if (i < list.length-1) str += ', ';
                        }
                        var hash = value.hash;
                        var str2 = '', i = 0;
                        for (const k in hash) {
                            if (hash.hasOwnProperty(k)) {
                                if (i++ > 0) str2 += ', ';
                                const v = hash[k];
                                str2 += (k + ': ' + VM.valueToString(v));
                            }
                        }
                        return 'hộp: [' + str + '] {' + str2 + '}';
                    }
                }
            } default:
            case 'undefined':
                return 'rỗng';
        }
    }
}

class Fun {
    constructor() {
        this.arity = 0;
        this.chunk = new Chunk();
        this.name = null;
    }
    static is(value) {
        return (value.constructor && value.constructor.name == 'Fun');
    }
}

class Box {
    constructor() {
        this.list = [];
        this.hash = {};
    }

    static is(value) {
        return (value.constructor && value.constructor.name == 'Box');
    }

    get(key) {
        key = key.toLowerCase();
        if (key == 'độdài')
            return this.list.length;
        return this.hash[key];
    }
    set(key, value) {
        key = key.toLowerCase();
        this.hash[key] = value;
    }

    geti(index) {
        return this.list[index];
    }
    seti(index, value) {
        if (index == this.list.length)
            return this.list.push(value);
        this[index] = value;
    }
}
