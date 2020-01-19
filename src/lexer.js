const TOKEN = {
    // Single-character tokens.                         
    LEFT_PAREN:         0,
    RIGHT_PAREN:        1,
    LEFT_BRACKET:       2,
    RIGHT_BRACKET:      3,
    LEFT_BRACE:         4,
    RIGHT_BRACE:        5,

    COMMA:              6,
    DOT:                7,
    MINUS:              8,
    PLUS:               9,    
    SEMICOLON:          10,
    SLASH:              11,
    STAR:               12,

    // One or two character tokens.                     
    BANG:               13,
    BANG_EQUAL:         14,          
    EQUAL:              15,
    EQUAL_EQUAL:        16,
    GREATER:            17,
    GREATER_EQUAL:      18,
    LESS:               19,
    LESS_EQUAL:         20,

    // Literals.                                        
    IDENTIFIER:         21,
    STRING:             22,
    NUMBER:             23,       

    // Keywords.                                        
    AND:                24,
    BREAK:              25,
    ELSE:               26,
    END:                27,
    EXIT:               28,
    FALSE:              29,    
    FOR:                30,
    FUN:                31,
    IF:                 32,
    NIL:                33,
    NOT:                34,
    OR:                 35,
    PRINT:              36,
    RETURN:             37,
    SUPER:              38,
    THEN:               39,
    TRUE:               40,
    VAR:                41,
    WHILE:              42,

    ERROR:              43,
    EOF:                44,

    KW_EQUAL:           45,
    KW_HAVE:            46,
    KW_OF:              47,
    KW_BOX:             48,
    KW_CONTAINT:        49
};

class Lexer
{
    constructor(src)
    {
        this.src = src;
        this.start = 0;
        this.current = 0;
        this.line = 1;
        this.position = 1;
    }

    visit() {
        var line = -1;                                                              
        for (;;) {
            var str = '';
            var token = this.scan();
                        
            if (token.line != line) {                                                 
                str += `${token.line} `;                                             
                line = token.line;                                                      
            } else {                                                                  
                str += "   | ";                                                        
            }                                                                         
            str += `${token.type} (${Object.keys(TOKEN)[token.type]}) '${token.start}'`;
            
            console.log(str);
            if (token.type == TOKEN.EOF) break;                                       
        }
    }

    isAlpha(c) {     
        c = c.charCodeAt();
        return (c >= 65 && c <= 90)     // 'A' - 'Z'
            || (c >= 97 && c <= 122)    // 'a' - 'z'
            || (c == 95)                // '_'
            || (c > 127);               // unicode chars
    } 

    isDigit(c) {
        c = c.charCodeAt();
        return  (c >= 48) && (c <= 57); // '0' - '9'
    }

    isAtEnd() {
        return this.current >= this.src.length;
    }

    newLine() {
        this.line++;
        this.position = 0;
    }

    advance() {
        this.current++;
        this.position++;
        return this.src.charAt(this.current-1);
    }

    peek() {
        return this.src.charAt(this.current);
    }

    peekNext() {     
        if (this.isAtEnd()) return '\0';
        return this.src.charAt(this.current+1); 
    }

    match(expected) {               
        if (this.isAtEnd()) return false;                   
        if (this.src.charAt(this.current) != expected)
            return false;     
        this.advance();
        return true;                                   
    }

    makeToken(type) {
        return {
            type: type,
            start: this.src.substring(this.start, this.current),
            line: this.line,
            column: this.position - (this.current - this.start)
        };
    }

    errorToken(message) {
        return {
            type: TOKEN.ERROR,
            start: message,
            line: this.line,
            column: this.position - 1
        };                               
    }

    skipWhitespace() {
        for (;;) {                  
            var c = this.peek();          
            switch (c) {              
                case ' ':               
                case '\r':              
                case '\t':              
                    this.advance();            
                    break;
                case '\n':       
                    this.newLine();
                    this.advance();     
                    break;
                case '/':                                          
                    if (this.peekNext() == '/') {                         
                        // A comment goes until the end of the line.   
                        while (this.peek() != '\n' && !this.isAtEnd())
                            this.advance();
                    } else {                                         
                        return;                                        
                    }                                                
                    break;
                default:                
                    return;               
            }                         
        }                           
    }

    identifierType() {
        const map = {
            'và':       TOKEN.AND,
            'dừng':     TOKEN.BREAK,
            'hay':      TOKEN.ELSE,
            'sai':      TOKEN.FALSE,
            'cho':      TOKEN.FOR,
            'hàm':      TOKEN.FUN,
            'nếu':      TOKEN.IF,
            'rỗng':     TOKEN.NIL,
            'hoặc':     TOKEN.OR,
            'in':       TOKEN.PRINT,
            'trả':      TOKEN.RETURN,
            'SUPER':    TOKEN.SUPER,
            'THIS':     TOKEN.THIS,
            'đúng':     TOKEN.TRUE,
            'biến':     TOKEN.VAR,
            'khi':      TOKEN.WHILE,
        
            'không':    TOKEN.NOT,
            'thì':      TOKEN.THEN,

            'thôi':     TOKEN.END,
            'xong':     TOKEN.END,

            'thoát':    TOKEN.EXIT,

            'bằng':     TOKEN.KW_EQUAL,
            'là':       TOKEN.KW_EQUAL,
            'có':       TOKEN.KW_HAVE,
            'chứa':     TOKEN.KW_HAVE,
            'của':      TOKEN.KW_OF,
            'trong':    TOKEN.KW_OF,
            'hộp':      TOKEN.KW_BOX,
        };
        var kw = this.src.substring(this.start, this.current);
        var type = map[kw.toLowerCase()];
        return type ? type : TOKEN.IDENTIFIER;       
    }

    identifier() {
        while (this.isAlpha(this.peek()) || this.isDigit(this.peek()))
            this.advance();
      
        return this.makeToken(this.identifierType());                  
    }

    number() {                      
        while (this.isDigit(this.peek()))
            this.advance();
      
        // Look for a fractional part.             
        if (this.peek() == '.' && this.isDigit(this.peekNext())) {
            // Consume the ".".                      
            this.advance();                               
      
            while (this.isDigit(this.peek()))
                this.advance();       
        }                                          
      
        return this.makeToken(TOKEN.NUMBER);            
    }

    string(closing) {
        while (this.peek() != closing && !this.isAtEnd()) {
            if (this.peek() == '\n') this.newLine();
            this.advance();
        }
      
        if (this.isAtEnd())
            return this.errorToken(`Cần có dấu nháy ${closing == '\'' ?
                'đơn "\'"' : "kép '\"'"} để kết thúc chuỗi.`);
      
        // The closing quote.
        this.advance();
        return this.makeToken(TOKEN.STRING);
    }

    scan() {
        this.skipWhitespace();

        this.start = this.current;

        if (this.isAtEnd()) return this.makeToken(TOKEN.EOF);

        var c = this.advance();
        if (this.isAlpha(c)) return this.identifier();
        if (this.isDigit(c)) return this.number();

        switch (c) {                                    
            case '(': return this.makeToken(TOKEN.LEFT_PAREN); 
            case ')': return this.makeToken(TOKEN.RIGHT_PAREN);
            case '[': return this.makeToken(TOKEN.LEFT_BRACKET); 
            case ']': return this.makeToken(TOKEN.RIGHT_BRACKET);
            case '{': return this.makeToken(TOKEN.LEFT_BRACE);
            case '}': return this.makeToken(TOKEN.RIGHT_BRACE);
            case ';': return this.makeToken(TOKEN.SEMICOLON);
            case ',': return this.makeToken(TOKEN.COMMA);
            case '.': return this.makeToken(TOKEN.DOT);
            case '-': return this.makeToken(TOKEN.MINUS);
            case '+': return this.makeToken(TOKEN.PLUS);
            case '/': return this.makeToken(TOKEN.SLASH);
            case '*': return this.makeToken(TOKEN.STAR);
            
            case '!':
                return this.makeToken(this.match('=') ? TOKEN.BANG_EQUAL : TOKEN.BANG);  
            case '=':                                                        
                return this.makeToken(this.match('=') ? TOKEN.EQUAL_EQUAL : TOKEN.EQUAL);
            case '<':                                                        
                return this.makeToken(this.match('=') ? TOKEN.LESS_EQUAL : TOKEN.LESS);  
            case '>':                                                        
                return this.makeToken(this.match('=') ? TOKEN.GREATER_EQUAL : TOKEN.GREATER);

            case '\'':
            case '\"':
                return this.string(c);
        }

        return this.errorToken("Kí tự không xác định.");
    }
};
