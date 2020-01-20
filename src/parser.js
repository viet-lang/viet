
const PREC = {
    NONE:       0,
    ASSIGNMENT: 1,  // =        
    OR:         2,  // or       
    AND:        3,  // and      
    EQUALITY:   4,  // == !=    
    COMPARISON: 5,  // < > <= >=
    TERM:       6,  // + -      
    FACTOR:     7,  // * /      
    UNARY:      8,  // ! -      
    CALL:       9,  // . ()     
    PRIMARY:    10
};

const FUNC = {
    NORMAL:     0,
    SCRIPT:     1
};

class Parser
{
    constructor(source)
    {
        this.lexer = new Lexer(source);
        this.compiler = null;     

        this.hadError = false;
        this.panicMode = false;

        this.hadCall = false;
        this.hadAssign = false;
        this.subExprs = 0;

        this.initCompiler(FUNC.SCRIPT);
    }

    chunk() {
        return this.compiler.func.chunk;
    }

    initCompiler(type) {
        var compiler = {}
        compiler.enclosing = this.compiler;
        compiler.localCount = 0;
        compiler.scopeDepth = 0;
        compiler.locals = {};

        compiler.scopeDepth = 0;
        compiler.currentLoop = null;

        compiler.type = type;
        compiler.func = new Fun();
        
        this.compiler = compiler;
        if (type != FUNC.SCRIPT) {                                     
            compiler.func.name = this.previous.start;
        }

        var local = {};
        local.depth = 0;
        local.name = {
            start: "",
            length: 0
        };

        compiler.locals[compiler.localCount++] = local;
        return compiler;
    }

    errorAt(token, message) {
        //if (this.panicMode) return; 
        if (this.hadError) return;
        //this.panicMode = true;

        var str = `[dòng ${token.line}:${token.column}] Lỗi`;
        if (token.type == TOKEN.EOF) {
            str += " ở cuối chương trình";
        } else if (token.type == TOKEN.ERROR) {
            // Nothing.
        } else {
            str += ` ở chỗ '${token.start}'`;
        }

        console.log(str + ": " + message);                          
        this.hadError = true;                                      
    }

    error(message) {
        this.errorAt(this.previous, message);   
    }

    errorAtCurrent(message) {
        this.errorAt(this.current, message);             
    }

    advance() {                           
        this.previous = this.current;
        
        for (;;) {                                      
            this.current = this.lexer.scan();                 
            if (this.current.type != TOKEN.ERROR) break;
      
            this.errorAtCurrent(this.current.start);         
        }                                               
    }

    consume(type, message) {
        if (this.current.type == type) {                      
            this.advance();                                            
            return;                                               
        }
      
        this.errorAtCurrent(message);                                
    }

    consumes(t1, t2, message) {
        if ((this.current.type == t1) ||
            (this.current.type == t2)) {                      
            this.advance();                                            
            return;                                               
        }
      
        this.errorAtCurrent(message);                                
    }

    check(type) {  
        return this.current.type == type;
    }           

    match(type) {
        if (!this.check(type)) return false;  
        this.advance();                       
        return true;                     
    }

    emitByte(byte) {                     
        this.chunk().emit(byte, this.previous.line, this.previous.column);
    }

    emitBytes(byte1, byte2) {
        this.emitByte(byte1);                                   
        this.emitByte(byte2);                                   
    }

    emitJump(instruction) {
        this.emitByte(instruction);                  
        this.emitByte(0xff);                         
        this.emitByte(0xff);
        return this.chunk().code.length - 2;       
    }

    emitLoop(loopStart) {                    
        this.emitByte(OP.LOOP);
      
        var offset = this.chunk().code.length - loopStart + 2;    
        if (offset > 0xFFFF) this.error("Loop body too large.");
      
        this.emitByte((offset >> 8) & 0xff);                        
        this.emitByte(offset & 0xff);                               
    }

    emitReturn() {
        this.emitByte(OP.NIL);
        this.emitByte(OP.RET);    
    }

    makeConstant(value) {
        var constant = this.chunk().add(value);
        if (constant >= 256) {
            this.error("Có quá nhiều hằng số trong một bó lệnh.");
            return 0;
        }
        return constant;
    }

    emitConstant(value) {
        this.emitBytes(OP.CONST, this.makeConstant(value));
    }

    patchJump(offset) {                           
        // -2 to adjust for the bytecode for the jump offset itself.
        var jump = this.chunk().code.length - offset - 2;
      
        if (jump > 0xFFFF) {
            this.error("Too much code to jump over.");
            return;
        }
     
        this.chunk().code[offset] = (jump >> 8) & 0xff;          
        this.chunk().code[offset + 1] = jump & 0xff;             
    }

    endCompiler() {
        this.emitReturn();      

        var current = this.compiler;
        var func = current.func;    
        
        this.compiler = current.enclosing; 
        return func;
    }

    beginScope() {
        var current = this.compiler;
        current.scopeDepth++;  
    }

    endScope() {
        var current = this.compiler; 

        current.scopeDepth--;
        while (current.localCount > 0 &&                      
            current.locals[current.localCount - 1].depth > current.scopeDepth) {                       
            this.emitByte(OP.POP);                                    
            current.localCount--;                               
        }
    }

    identifierConstant(name) {                      
        return this.makeConstant(name.start);
    }

    static identifiersEqual(a, b) {  
        if (a.length != b.length) return false;         
        return (a.start.toLowerCase() == b.start.toLowerCase());
    }

    resolveLocal(compiler, name) {
        for (var i = compiler.localCount - 1; i >= 0; i--) {   
            var local = compiler.locals[i];
            if (Parser.identifiersEqual(name, local.name)) {
                if (local.depth == -1) {
                    this.error("Không thể đọc biến khi đang khai báo chính nó.");
                }
                return i;                                           
            }
        }
      
        return -1;                                              
    }

    addLocal(name) {
        var current = this.compiler; 
        
        if (current.localCount == 256) {              
            this.error("Có quá nhiều biến trong một hàm.");      
            return;                                              
        }

        var local = {};
        local.name = name;                                    
        local.depth = -1;
        current.locals[current.localCount++] = local;
    }

    declareVariable() {     
        var current = this.compiler; 
        
        // Global variables are implicitly declared.
        if (current.scopeDepth == 0) return;
      
        var name = this.previous;
        for (var i = current.localCount - 1; i >= 0; i--) {
            var local = current.locals[i];
            if (local.depth != -1 && local.depth < current.scopeDepth) {    
                break;
            }
        
            if (Parser.identifiersEqual(name, local.name)) {                        
                this.error("Biến cục bộ trong scope này đã được khai báo trước đó.");
            }
        }

        this.addLocal(name);                            
    }

    parseVariable(errorMessage) {
        var current = this.compiler; 

        this.consume(TOKEN.IDENTIFIER, errorMessage);

        this.declareVariable();
        if (current.scopeDepth > 0) return 0;

        return this.identifierConstant(this.previous);          
    }

    markInitialized()
    {      
        var current = this.compiler; 
        if (current.scopeDepth == 0) return; 
        current.locals[current.localCount - 1].depth =
            current.scopeDepth;                        
    }

    defineVariable(global) {
        var current = this.compiler; 
        if (current.scopeDepth > 0) {     
            this.markInitialized();        
            return;                                 
        }
        this.emitBytes(OP.DEF, global);      
    }

    argumentList() {                             
        var argCount = 0;                                     
        if (!this.check(TOKEN.RIGHT_PAREN)) {                          
            do {                                                    
                this.expression();                            
                if (++argCount >= 32) {                          
                    this.error("Không thể vượt quá 32 tham số.");
                    return;
                }                                       
            } while (this.match(TOKEN.COMMA));                           
        }
        
        this.consume(TOKEN.RIGHT_PAREN, "Thiếu dấu ngoặc ')' sau tham số.");
        return argCount;                                          
    }

    static and_(self, canAssign) {         
        var endJump = self.emitJump(OP.JMPF);
        
        self.emitByte(OP.POP);                        
        self.parsePrecedence(PREC.AND);               
      
        self.patchJump(endJump);                      
    }

    static binary(self, canAssign) {                                     
        // Remember the operator.
        var operatorType = self.previous.type;
      
        // Compile the right operand.
        var rule = self.getRule(operatorType);
        self.parsePrecedence(rule[2] + 1);

        // Emit the operator instruction.
        switch (operatorType) {
            case TOKEN.LESS:          self.emitByte(OP.LT); break;
            case TOKEN.LESS_EQUAL:    self.emitByte(OP.LE); break;
            case TOKEN.GREATER:       self.emitByte(OP.GT); break;
            case TOKEN.GREATER_EQUAL: self.emitByte(OP.GE); break;

            case TOKEN.KW_EQUAL:
            case TOKEN.EQUAL_EQUAL:   self.emitByte(OP.EQ); break;
            case TOKEN.BANG_EQUAL:    self.emitBytes(OP.EQ, OP.NOT); break;

            case TOKEN.PLUS:          self.emitByte(OP.ADD); break;     
            case TOKEN.MINUS:         self.emitByte(OP.SUB); break;
            case TOKEN.STAR:          self.emitByte(OP.MUL); break;
            case TOKEN.SLASH:         self.emitByte(OP.DIV); break;

            default:                                               
                return; // Unreachable.                              
        }                                                        
    }

    static call(self, canAssign) {  
        self.hadCall = true;
        var argCount = self.argumentList();
        self.emitBytes(OP.CALL, argCount);
    }

    static dot(self, canAssign) {
        self.consume(TOKEN.IDENTIFIER, "Thiếu tên thuộc tính sau dấu chấm '.'.");
        var name = self.identifierConstant(self.previous);

        if (canAssign &&
            (self.match(TOKEN.EQUAL) || self.match(TOKEN.KW_EQUAL))) {
            self.expression();
            self.emitBytes(OP.SET, name);
            self.hadAssign = true;
        } else {
            self.emitBytes(OP.GET, name);
        }
    }

    static index(self, canAssign) {
        self.expression();
        self.consume(TOKEN.RIGHT_BRACKET, "Thiếu đóng ngoặc ']'.");
    
        if (canAssign &&
            (self.match(TOKEN.EQUAL) || self.match(TOKEN.KW_EQUAL))) {
            self.expression();
            self.emitByte(OP.SETI);
            self.hadAssign = true;
        }
        else {
            self.emitByte(OP.GETI);
        }
    }

    static have(self, canAssign) {
        self.consume(TOKEN.STRING, 'Thiếu chuỗi tên thuộc tính');
        Parser.string(self);
        self.consumes(TOKEN.EQUAL, TOKEN.KW_EQUAL,
            "Thiếu từ khóa 'bằng' hoặc dấu '=' sau chuỗi tên thuộc tính.");
        self.expression();
        self.emitByte(OP.SETI);
        self.hadAssign = true;
    }

    static of_(self, canAssign) {
        self.expression();
        self.emitByte(OP.OF);
    }

    static literal(self, canAssign) {                         
        switch (self.previous.type) {
            case TOKEN.NIL:     self.emitByte(OP.NIL); break;    
            case TOKEN.TRUE:    self.emitByte(OP.TRUE); break;        
            case TOKEN.FALSE:   self.emitByte(OP.FALSE); break;
            case TOKEN.FUN:     self.emitBytes(OP.LD, 0); break;
            default:
                return; // Unreachable.                   
        }
    }

    static box(self, canAssign) {
        var count = 0;
        if (!self.check(TOKEN.RIGHT_BRACKET)) {
            do {
                self.expression();
                count++;
            } while (self.match(TOKEN.COMMA));
        }

        self.consume(TOKEN.RIGHT_BRACKET, "Thiếu đóng ngoặc ']'.");
        self.emitBytes(OP.BOX, count);
    }

    static kw_box(self, canAssign) {  
        var count = 0;

        if (self.match(TOKEN.KW_HAVE)) {
            do {
                self.expression("Hộp phải chứa ít nhất một giá trị.");
                count++;
            } while (self.match(TOKEN.COMMA));
        }
    
        self.emitBytes(OP.BOX, count);
    }

    static kw_call(self, canAssign) {
        var argc = 0;
        self.expression();
        if (self.match(TOKEN.KW_WITH)) {
            do {
                self.expression();
                if (argc++ >= 32) {
                    self.error("Không thể vượt quá 32 tham số.");
                    return;
                }
            } while (self.match(TOKEN.COMMA));
        }
        self.emitBytes(OP.CALL, argc);
        self.hadCall = true;
    }

    static grouping(self, canAssign) {
        if (self.match(TOKEN.RIGHT_PAREN)) {
            self.emitByte(OP.NIL);
            return;
        }
        self.expression();                                              
        self.consume(TOKEN.RIGHT_PAREN, "Thiếu dấu ngoặc ')' sau biểu thức.");
    }

    static number(self, canAssign) {                               
        var value = Number.parseFloat(self.previous.start);
        self.emitConstant(value);
    }

    static string(self, canAssign) {
        var length = self.previous.start.length;
        var value = self.previous.start.substring(1, length-1);
        self.emitConstant(value);
    }

    namedVariable(name, canAssign) {
        var getOp, setOp;
        var arg = this.resolveLocal(this.compiler, name);
        if (arg != -1) {
            getOp = OP.LD;
            setOp = OP.ST;
        } else {
            arg = this.identifierConstant(name);
            getOp = OP.GLD;
            setOp = OP.GST;
        }

        if (canAssign &&
            (this.match(TOKEN.EQUAL) || this.match(TOKEN.KW_EQUAL))) {
            this.expression();
            this.emitBytes(setOp, arg);
            this.hadAssign = true;
        } else {                                
            this.emitBytes(getOp, arg);
        }
    }

    static variable(self, canAssign) {
        self.namedVariable(self.previous, canAssign);
    }

    static or_(self, canAssign) {
        var elseJump = self.emitJump(OP.JMPF);
        var endJump = self.emitJump(OP.JMP);
      
        self.patchJump(elseJump);
        self.emitByte(OP.POP);
      
        self.parsePrecedence(PREC.OR);
        self.patchJump(endJump);
    }  

    static unary(self, canAssign) {                            
        var operatorType = self.previous.type;
      
        // Compile the operand.                        
        self.parsePrecedence(PREC.UNARY);                               
      
        // Emit the operator instruction.              
        switch (operatorType) {          
            case TOKEN.NOT:
            case TOKEN.BANG:    self.emitByte(OP.NOT); break;         
            case TOKEN.MINUS:   self.emitByte(OP.NEG); break;
            default:                                     
                return; // Unreachable.                    
        }                                              
    }

    static rules = [
        [ Parser.grouping,  Parser.call,    PREC.CALL ],        // LEFT_PAREN
        [ null,             null,           PREC.NONE ],        // RIGHT_PAREN
        [ Parser.box,       Parser.index,   PREC.CALL ],        // LEFT_BRACKET
        [ null,             null,           PREC.NONE ],        // RIGHT_BRACKET
        [ null,             null,           PREC.NONE ],        // LEFT_BRACE
        [ null,             null,           PREC.NONE ],        // RIGHT_BRACE

        [ null,             null,           PREC.NONE ],        // COMMA
        [ null,             Parser.dot,     PREC.CALL ],        // DOT

        [ Parser.unary,     Parser.binary,  PREC.TERM ],        // MINUS
        [ null,             Parser.binary,  PREC.TERM ],        // PLUS
        [ null,             null,           PREC.NONE ],        // SEMICOLON
        [ null,             Parser.binary,  PREC.FACTOR ],      // SLASH
        [ null,             Parser.binary,  PREC.FACTOR ],      // STAR

        [ Parser.unary,     null,           PREC.NONE ],        // BANG
        [ null,             Parser.binary,  PREC.EQUALITY ],    // BANG_EQUAL
        [ null,             null,           PREC.NONE ],        // EQUAL
        [ null,             Parser.binary,  PREC.EQUALITY ],    // EQUAL_EQUAL
        [ null,             Parser.binary,  PREC.COMPARISON ],  // GREATER
        [ null,             Parser.binary,  PREC.COMPARISON ],  // GREATER_EQUAL
        [ null,             Parser.binary,  PREC.COMPARISON ],  // LESS
        [ null,             Parser.binary,  PREC.COMPARISON ],  // LESS_EQUAL

        [ Parser.variable,  null,           PREC.NONE ],        // IDENTIFIER
        [ Parser.string,    null,           PREC.NONE ],        // STRING
        [ Parser.number,    null,           PREC.NONE ],        // NUMBER

        [ null,             Parser.and_,    PREC.AND ],         // AND
        [ null,             null,           PREC.NONE ],        // BREAK
        [ null,             null,           PREC.NONE ],        // ELSE
        [ null,             null,           PREC.NONE ],        // END
        [ null,             null,           PREC.NONE ],        // EXIT
        [ Parser.literal,   null,           PREC.NONE ],        // FALSE
        [ null,             null,           PREC.NONE ],        // FOR
        [ Parser.literal,   null,           PREC.NONE ],        // FUN
        [ null,             null,           PREC.NONE ],        // IF
        [ Parser.literal,   null,           PREC.NONE ],        // NIL
        [ Parser.unary,     null,           PREC.NONE ],        // NOT
        [ null,             Parser.or_,     PREC.OR ],          // OR
        [ null,             null,           PREC.NONE ],        // PRINT
        [ null,             null,           PREC.NONE ],        // RETURN
        [ null,             null,           PREC.NONE ],        // SUPER
        [ null,             null,           PREC.NONE ],        // THEN
        [ Parser.literal,   null,           PREC.NONE ],        // TRUE
        [ null,             null,           PREC.NONE ],        // VAR
        [ null,             null,           PREC.NONE ],        // WHILE

        [ null,             null,           PREC.NONE ],        // ERROR
        [ null,             null,           PREC.NONE ],        // EOF

        [ null,             Parser.binary,  PREC.EQUALITY ],    // KW_EQUAL
        [ null,             Parser.have,    PREC.CALL ],        // KW_HAVE
        [ null,             Parser.of_,     PREC.CALL ],        // KW_OF
        [ Parser.kw_box,    null,           PREC.NONE ],        // KW_BOX
        [ Parser.kw_call,   null,           PREC.CALL],         // KW_CALL
        [ null,             null,           PREC.NONE]          // KW_WITH
    ];

    parsePrecedence(precedence, message = null) {
        this.advance();
        var prefixRule = this.getRule(this.previous.type)[0];
        if (prefixRule == null) {
            this.error(message != null ? message : "Thiếu biểu thức.");                             
            return;
        }

        var canAssign = precedence <= PREC.ASSIGNMENT;
        prefixRule(this, canAssign);
        this.subExprs++;
        
        while (precedence <= this.getRule(this.current.type)[2]) {
            if (this.current.line > this.previous.line) break;
            this.advance();
            var infixRule = this.getRule(this.previous.type)[1];     
            infixRule(this, canAssign);                                                  
        }

        if (canAssign && this.match(TOKEN.EQUAL)) {                          
            this.error("Phép gán không hợp lệ.");
            return;
        }
    }

    getRule(type) {
        return Parser.rules[type];                     
    }

    expression(message = null) {
        this.parsePrecedence(PREC.ASSIGNMENT, message);
    }

    block() {                                     
        while (!this.check(TOKEN.RIGHT_BRACE) &&
            !this.check(TOKEN.EOF)) {
            this.declaration();                                        
        }
      
        this.consume(TOKEN.RIGHT_BRACE, "Thiếu đóng ngoặc '}' sau khối lệnh.");  
    }

    func(type) {                       
        var compiler = this.initCompiler(type);                                
        this.beginScope();
      
        // Compile the parameter list.                                
        this.consume(TOKEN.LEFT_PAREN, "Thiếu mở ngoặc '(' sau tên hàm.");
        if (!this.check(TOKEN.RIGHT_PAREN)) {                                    
            do {
                var arity = this.compiler.func.arity++;                                     
                if (arity > 32) {
                    this.errorAtCurrent("Không thể có nhiều hơn 32 tham số.");
                    return;
                }
                var paramConstant = this.parseVariable("Thiếu tên tham số.");
                this.defineVariable(paramConstant);                                  
            } while (this.match(TOKEN.COMMA));                                     
        }
        this.consume(TOKEN.RIGHT_PAREN, "Thiếu đóng ngoặc ')' sau tham số.");   
      
        // The body.
        if (this.match(TOKEN.LEFT_BRACE)) {
            while (!this.check(TOKEN.RIGHT_BRACE) &&
                !this.check(TOKEN.EOF)) {
                this.declaration();
            }
            this.consume(TOKEN.RIGHT_BRACE, "Cần có đóng ngoặc '}' để kết thúc hàm.");
        }
        else {
            while (!this.check(TOKEN.END) &&
                !this.check(TOKEN.EOF)) {
                this.declaration();
            }
            this.consume(TOKEN.END, "Cần có từ khóa 'xong' hoặc 'thôi' để kết thúc hàm.");
        }

        // Create the function object.
        var func = this.endCompiler();
        this.emitBytes(OP.CONST, this.makeConstant(func));      
    }

    funDeclaration() {
        if (this.compiler.type != FUNC.SCRIPT ||
            this.compiler.scopeDepth > 0) {
            this.error("Hàm phải được khai báo trong than chương trình.");
            return;
        }

        var global = this.parseVariable("Thiếu tên hàm.");
        this.markInitialized();                                      
        this.func(FUNC.NORMAL);                                
        this.defineVariable(global);                                 
    }

    varDeclaration() {                                       
        var global = this.parseVariable("Thiếu tên biến.");
      
        if (this.match(TOKEN.EQUAL) ||
            this.match(TOKEN.KW_EQUAL)) {                                          
            this.expression();                                                    
        } else {                                                           
            this.emitByte(OP.NIL);                                                
        }                                                                  

        this.defineVariable(global);                                            
    }

    expressionStatement() {  
        this.hadCall = false;
        this.hadAssign = false;
        this.subExprs = 0;

        this.expression();
        this.emitByte(OP.POP);

        if ((this.subExprs <= 1 && !this.hadCall) ||
            (this.subExprs > 1 && !this.hadCall && !this.hadAssign)) {
            this.error("Biểu thức không hợp lệ.");
        }
    }

    ifStatement(needEnd) {

        this.expression();
        this.consume(TOKEN.THEN, "Thiếu từ khóa 'thì' sau điều kiện.");
      
        var thenJump = this.emitJump(OP.JMPF);  
        this.emitByte(OP.POP);                         
        
        if (this.current.line == this.previous.line) {
            this.statement();
            needEnd = false;
        }
        else {
            this.beginScope();
            while (!this.check(TOKEN.ELSE) &&
                !this.check(TOKEN.END) && !this.check(TOKEN.EOF)) {
                this.declaration();
            }
            this.endScope();
        }
        
        var elseJump = this.emitJump(OP.JMP);     
        this.patchJump(thenJump);
        this.emitByte(OP.POP);
        
        if (this.match(TOKEN.ELSE)) {
            if (this.match(TOKEN.IF)) {
                this.ifStatement(true);
                needEnd = false;
            }
            else {
                this.beginScope();
                while (!this.check(TOKEN.END) && !this.check(TOKEN.EOF)) {
                    this.declaration();
                }
                this.endScope();
            }
        }

        this.patchJump(elseJump);

        if (needEnd) {
            this.consume(TOKEN.END, "Cần có từ khóa 'xong' sau khối lệnh để kết thúc mệnh đề 'nếu'.");
        }
    }

    printStatement() {                        
        this.expression();
        this.emitByte(OP.PRINT);
    }

    returnStatement() {
        if (this.compiler.type == FUNC.SCRIPT) {           
            this.error("Khổng thể đặt câu lệnh trả về ngoài hàm.");
            return;
        }

        if (this.match(TOKEN.SEMICOLON) ||
            this.check(TOKEN.END)) {
            this.emitReturn();
        } else {
            this.expression();
            this.emitByte(OP.RET);
        }
    }

    exitStatement() {
        this.emitByte(OP.EXIT);
    }

    breakStatement() {
        var current = this.compiler;
        var loop = current.currentLoop;

        if (current.loopDepth == 0) {
            error(P, "Không thể sử dụng 'dừng' ở ngoài vòng lặp.");
            return;
        }

        // Store scope state.
        var locals = current.localCount;
        var depth = current.scopeDepth;
        // Close all, down to loop scope.
        do { this.endScope(); } while (current.scopeDepth > loop.scope);
        // Load the state.
        current.localCount = locals;
        current.scopeDepth = depth;
        
        var jmpOut = this.emitJump(OP.JMP);
        loop.breaks[loop.breakCount++] = jmpOut;
    }

    whileStatement() {
        // Init a loop.
        var current = this.compiler;
        var loop = {
            breakCount: 0,
            breaks: [],
            scope: -1
        };

        current.loopDepth++
        current.currentLoop = loop;
        loop.scope = current.scopeDepth;

        var loopStart = this.chunk().code.length;

        this.expression();
        this.consume(TOKEN.THEN, "Thiếu từ khóa 'thì' sau điều kiện.");

        var exitJump = this.emitJump(OP.JMPF);                
      
        this.emitByte(OP.POP);
        if (this.current.line == this.previous.line) {
            this.statement();
        }
        else {
            this.beginScope();
            while (!this.check(TOKEN.END) && !this.check(TOKEN.EOF)) {
                this.declaration();
            }
            this.endScope();

            this.consume(TOKEN.END, "Cần có từ khóa 'xong' hoặc 'thôi' để kết thúc khối lệnh.");
        }
        
        this.emitLoop(loopStart);
        
        this.patchJump(exitJump);
        this.emitByte(OP.POP);

        // Patch all breaks.
        for (var i = 0; i < loop.breakCount; i++)
            this.patchJump(loop.breaks[i]);

        current.loopDepth--;
        current.currentLoop = null;
    }

    synchronize() {                             
        this.panicMode = false;

        while (this.current.type != TOKEN.EOF) {
            if (this.previous.type == TOKEN.SEMICOLON) return;
            switch (this.current.type) {
                case TOKEN.FUN:
                case TOKEN.VAR:
                case TOKEN.FOR:
                case TOKEN.IF:
                case TOKEN.WHILE:
                case TOKEN.PRINT:
                case TOKEN.RETURN:
                return;
        
                default:; // Do nothing.
            }
            this.advance();
        }
    }

    declaration() {
        if (this.match(TOKEN.FUN)) {       
            this.funDeclaration();           
        } else if (this.match(TOKEN.VAR)) {      
            this.varDeclaration();                 
        } else {                            
            this.statement();                      
        }   
        
        if (this.panicMode) this.synchronize();
    }

    statement() {
        if (this.match(TOKEN.PRINT)) {
            this.printStatement();
        } else if (this.match(TOKEN.IF)) {        
            this.ifStatement(true);
        } else if (this.match(TOKEN.RETURN)) {
            this.returnStatement();
        } else if (this.match(TOKEN.EXIT)) {
            this.exitStatement();
        } else if (this.match(TOKEN.BREAK)) {
            this.breakStatement(); 
        } else if (this.match(TOKEN.WHILE)) {
            this.whileStatement();
        } else if (this.match(TOKEN.LEFT_BRACE)) {
            this.beginScope();                      
            this.block();                           
            this.endScope();
        } else if (this.match(TOKEN.SEMICOLON)) {
            // Do nothing.
        } else {
            this.expressionStatement();
        }

        this.match(TOKEN.SEMICOLON);
    }

    compile() {
        this.advance();                                      
        
        if (!this.match(TOKEN.EOF)) {
            do {
                this.declaration();
            } while (!this.match(TOKEN.EOF));
        }

        var func = this.endCompiler();
        return this.hadError ? null : func;
    }
}
