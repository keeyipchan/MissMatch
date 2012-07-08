/**
 * MissMatch (v0.1)
 * ---------------------------------------------------------------------
 * 
 * A Haskell-Style pattern matcher for JavaScript. You can match
 * any kind of JavaScript values against patterns. Patterns can
 * be arbitrarily nested which lets you match against all types
 * of nested JavaScript arrays and objects.
 * 
 * Example Usage:
 * 
 * missmatch(candidateObj, {
 *  'o(.x, .y)'   : function () { return this.x * this.y },
 *  'a(n@x, n@y)  : function () { return this.x * this.y },
 *    ...
 * });
 */

/**
 * makeParser
 * generates a new parser from a pattern. A parser transformes a pattern
 * into an Abstract Syntax Tree that can be compiled to a matcher
 * function.
 * 
 * Usage:
 * var AST = makeParser('o(.x, .y)').parse()
 * --> creates an AST that can be compiled into a matcher function which
 * in turn can recognize objects with at least the two  properties 
 * x and y.
 */
 
/*--------------------------------------------------------------------*/
var makeParser = function (src) {
  var index = 0;

  /**
   * Match valid JavaScript variable names. Only letters are allowed
   * at the moment. I know this is VASTLY incomplete.
   * TODO: find a better validation.
   */
  var validChar = function (c) {
    var code = c.charCodeAt(0);
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }
  
  /**
   * Match valid JS object property names. Like variable names
   * this is incomplete. 
   * TODO: A better validation has to be found.
   */
  var validProp = function (c) {
    return validChar(c) 
      || (c === '_') 
      || ((c.charCodeAt(0) >= 47) && (c.charCodeAt(0) <= 57));
  }
  
  /**
   * Typical parser helper functions.
   */
  var next    = function ( ) { return src[index++]; }    
  var hasNext = function ( ) { return index < src.length; }  
  var consume = function ( ) { index ++; }
  var peek    = function ( ) { return src[index]; }  
  var clear   = function ( ) { while(peek() === ' ') consume(); }
  var match   = function (t) { return t === next(); }  
  
  var newNode = function (type,AST) {
    var node = {
      type: type,
      nodes: [],
      binding: false
    };
    
    AST.push(node);
    return node;
  }
  
  /**
   * Parses @ bindings. (Patterns bound to variables that are available
   * in the handler function if the pattern matches).
   * e.g. 'n@x' matches a numeric value and binds it to 'x'.
   */
  var parseBinding = function (node) {    
    consume(); // consume '@'
    var binding = [];
    
    while (hasNext()) {
      if (validChar(peek()))
        binding.push(next());
      else
        break;    
    }
     
    binding = binding.join('');  
                        
    if (binding.length > 0)
      node.binding = binding;
    else
      throw "No binding name given at " + index + " for " + node.type;
  }
  
  /**
   * Parses the (...) component of an array pattern.
   */
  var parseArrayList = function (node) {
    consume(); // '('
        
    while (true) {
      /**
       * Use clear() to allow whitespace on certain locations:
       * (n,n@x), (n, n@x), ( n , n@x ) are all accepted.
       * (n, n @x) is not accepted: bindings do not allow
       * any whitespace.
       */
      clear(); stage1(node.nodes); clear(); 
      if(peek() !== ',') 
        break;
      else 
        consume(); // ','
    }
  }
  
  var parseArray = function (AST) {
    consume(); // 'a'
    
    var node = newNode('array', AST);
    
    if(hasNext()) {
      /**
       * Array may be matched by either
       * a@name: Array bound to name
       * a(...): Array pattern
       */
      switch(peek()) {
        case '@':
          parseBinding(node);
          return;
        case '(':
          parseArrayList(node);
          break;
        default:
          /**
           * Allow patterns like a(a) to match nested arrays without
           * binding them to names.
           */
          return;
          break;
      }
    
      /**
       * Check if the rest of the array 
       * is matched against.
       */
      if(peek() === '|') {
        consume();
        var rest = newNode('rest', node.nodes);
        /**
         * Check if the rest argument is bound
         * to a name.
         */         
        clear();
        if(peek() === '@') {
          parseBinding(rest);          
          clear();
        }
      }              

      /**
       * Ensure that the array pattern is correctly
       * terminated (with a closing parentheses).
       */
      if(!match(')'))
        throw "Unexpected token at index " + index + " expected: ')'";
      else {
        /**
         * The array pattern might be bound to a name.
         */
        if(hasNext() && peek() === '@')
          parseBinding(node);
      }
    }
  }
  
  /**
   * Parse a single property. Valid property names can contain
   * upper- and lowercase lettern, _ and numbers.
   */
  var parseProperty = function (node) {
    consume(); // '.'
    var name = [];
    
    while(validProp(peek())) {
      name.push(next());
    }
    
    name = name.join('');
    
    if(name.length > 0) {
      var property = newNode('property', node.nodes);
      property.name = name;
      
      /**
       * Properties may have type specifiers. This is the way to go
       * to match nested objects.
       * 
       * e.g. 'o(.coord:o(.x, .y))' matches objects like 
       *  '{coord: {x: 5, y: 7} }'
       */
      if(hasNext() && peek() === ':') {
        consume();
        stage1(property.nodes);
      }
      
      /**
       * A property may of course have a binding.
       */
      if(hasNext() && peek() === '@')
        parseBinding(property);
    } else {
      throw "No property name given at " + index + " for " + node.type;
    }
  }
  
  /**
   * Parse the property list of an object:
   * the (.x, .y) component.
   */
  var parseProperties = function (node) {
    consume(); // '('
    
    while(true) {
      clear();
      /**
       * Properties always have to start with '.'
       * o(.x, .y) -> An object with at least the two
       * properties x and y.
       */
      if(peek() === '.') {
        parseProperty(node);        
      }
      clear();
            
      if(peek() !== ',')
        break;
      else
        consume(); // ','
    }
  }
  
  var parseObject = function (AST) {
    consume(); // 'o'
    
    var node = newNode('object', AST);
    
    if(hasNext()) {
     /**
       * An object may be matched by either
       * o@name: Object bound to name
       * o(...): Object pattern
       */
      switch(peek()) {
        case '@':
          parseBinding(node);
          return;
        case '(':
          parseProperties(node);
          break;
        default:
          /**
           * Allow patterns like a(o) to match nested objects without
           * binding them to names.
           */
          return;
          break;
      }  
      
     /**
       * Ensure that the object pattern is correctly
       * terminated (with a closing parentheses).
       */
      if(!match(')'))
        throw "Unexpected token at index " + index + " expected: ')'";
      else {
        /**
         * The array pattern might be bound to a name.
         */
        if(hasNext() && peek() === '@')
          parseBinding(node);
      }        
    }    
  }
    
  /**
   * Matches any of the one-character type descriptors
   * (n,s,b,f,_) and creates an AST node for them.
   * They are all treated the same.
   */
  var parseGeneric = function (AST,type) {
    consume(); // type descriptor
    var node = newNode(type,AST);
        
    if(peek() === '@') 
      parseBinding(node);
  }
  
  /**
   * Parse string literals. String can be introduced with
   * 'string' or "string". Note that even when you want to match
   * against a single string literal you have to use double-quotes:
   * "'my_string'" or '"my_string"'
   */
  var parseStringLiteral = function (AST,enclosing) {
    consume(); // ' or "
    var literal = [];
    while(hasNext() && peek() !== enclosing) {
      literal.push(next());
    }
    
    consume(); // ' or "
    var node = newNode('equals', AST);
    newNode(literal.join(''), node.nodes);
    
    /**
     * Even a literal may be bound to a name
     */
    if(peek() === '@') 
      parseBinding(node);
  }
  
  /**
   * Parser entry point. any expression must start
   * with either a type descriptor or a literal.
   */
  var stage1 = function (AST) {
    if(hasNext()) {
      switch (peek()) {
        case 'a':
          parseArray(AST);
          break;
        case 'o':
          parseObject(AST);
          break;
        case 'n':
          parseGeneric(AST,'numeric');
          break;
        case 's':
          parseGeneric(AST,'string');
          break;
        case 'b':
          parseGeneric(AST,'boolean');
          break;
        case 'f':
          parseGeneric(AST,'function');
          break;
        case '_':
          parseGeneric(AST, 'any');
          break;
        case "'":
          parseStringLiteral(AST, "'");
          break;
        case '"':
          parseStringLiteral(AST, '"');
          break;
        default:
          throw "Unexpected token at " + index + " : " + peek();
      }
    }
          
    return AST;
  }
  
  return {
    parse: function () {
      var AST = stage1([]);
      /**
       * Clear trailing whitespace
       */
      clear();
        
      if(index !== src.length) {
        throw "Expected end of input but tokens found: " + index;
      }
      return AST;
    }
  }
}
/*--------------------------------------------------------------------*/

/**
 * makeCompiler
 * generates a matcher function from a previously generated AST.
 * The matcher function will match input and store bound variables.
 * 
 * The compiler does not generate JavaScript Code and does not require
 * any use of 'eval'. It uses currying to build predicate functions
 * that take other predicate functions as arguments that take other...
 * 
 * The result is a kind of 'function tree' that can be executed.
 */
 
/*--------------------------------------------------------------------*/
function makeCompiler(AST) {
  var bindingContext = {};
  
  /**
   * curry takes a function, and a partial list of arguments and returns
   * a function that can be executed with the rest of the arguments.
   * 
   * --> var max = curry(Math.max, [2,5]);
   * --> max(4);
   * --> 5
   */
  var curry = function (fun, args, asArray) {
    return function () {  
      var this_args = Array.prototype.slice.call(arguments);
      return fun.apply(
        bindingContext, 
        (asArray ? args : [args]).concat(this_args)
      );
    }
  }
    
  /**
   * Thanks to Kangax for the isArray function.
   * http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
   */
  var isArray = function (o) {
		return Object.prototype.toString.call(o) === '[object Array]';
	}

  /**
   * bind acts like a predicate but it also binds a variable to a
   * name and puts it in the binding context. The parameters are:
   * n: the binding name
   * p: the actual predicate associated with this binding
   * v: the value that this function is executed on. 
   * 
   * The first two parameters have to be parameterized by
   * the comiler (curry). The fourth parameter is passed at
   * runtime.
   */
  var bind = function (n,p,v) {
    var m = p(v);
    if(m.result) {
      bindingContext[n] = 
        m.obj ? m.obj[m.param] : m.param;
    }
    
    /**
     * Sometimes we have to alter the binding value after executing
     * bind. For example when the rest of an array is matched. At bind
     * time the rest of the array is not known. So we store the
     * name of the binding that can later be retrieved from the
     * bindingContext.
     */
    m['this_binding'] = n;    
    return m;
  }
  
  /* Predicates */
  
  /* matches anything */
  var any = function (x) { 
    return {
      result: true,
      param: x
    }
  }
  
  /* matches the rest of an array */
  var rest = function (x) {
    return {
      result: true,
      param: x,
      rest: true
    };
  }
  
  /* matches exactly the same value */
  var equals = function (x,o) {
    return {
      result: x === o,
      param: x
    }
  }
  
  /* matches a value that is typeof 'type' */
  var typePredicate = function (type,x) {
    return {
      result: typeof x === type,
      param: x
    };
  }
  
  /**
   * Tests wether an object has a given property. It uses hasOwnProperty
   * to do that. So the prototype chain is not considered.
   * TODO: Is this good or bad and should we change this?
   * 
   * The arguments are:
   * m: (optional) type predicate
   * x: the name of the property
   * o: the object to test (this is passed at runtime)
   */
  var hasProperty = function (m,x,o) { 
    var result = o.hasOwnProperty(x);
    if(m.length) {
      result &= m[0](o[x]).result;
    }
    
    return {
      result: result,
      param: x,
      obj: o
    };
  };

  // TODO: refactor, beatify this function.
  var matchArray = function (m,a) {    
    var result = {
      result: true,
      param: a
    }
    
    if (!isArray(a)) {
      result.result = false;
      return result;
    }
        
    /**
     * If there are more predicates than array items, this
     * can't match.
     */ 
    if (m.length > a.length) {
      result.result = false;
      return result;
    }

    /**
     * If there are no predicates at all, this matches.
     * Because we have already ensured that it es a valid array.
     */
    if(m.length === 0) {
      return result;
    }
                
    var from = 0;
    var rest = false;
    var restBindingResult;
                        
    for(index in a) {
      var matcher = m[index];
      var item = a[index];
            
      if(!matcher) {      
        result.result = false;
        return result;
      }
      
      var matchResult = matcher(item);
      if(!matchResult.result) {
        result.result = false;
        return result;
      }
      
      /**
       * If the rest of an array is matched, the predicate will
       * return an object that has a'rest' parameter. We can't 
       * recognize the rest predicate by it's functio name, because
       * it might be hidden behind a 'bind' quasi-predicate.
       */
      if(matchResult.rest) {
        restBindingResult = matchResult;
        from = index;
        rest = true;
        break;
      }
    }
    
    if(rest && restBindingResult.this_binding) {
      var restOfArray = [];
      for(var i = from; i < a.length; i++) {
        restOfArray.push(a[i]);
      }
      bindingContext[restBindingResult.this_binding] = restOfArray;
    }
    
    return result;
  }

  var matchObject = function (m,o) {
    var result = {
      result: true,
      param: o
    };
    
    if(isArray(o)) {
      result.result = false;
      return result;
    }
    
    if(typeof o !== 'object') {
      result.result = false;
      return result;
    }
    
    for(index in m)
      if(!m[index](o).result) {
        result.result = false;
        return result;
      }
        
    return result;
  }

  /**
   * Compiles a single subnode of the AST. This one is recursively
   * called.
   */
  var compileNode = function (ast) {
    var result = [];
    
    for(index in ast) {
      var node = ast[index];
      var matcher;
      
      switch(node.type) {
        case 'array':
          matcher = curry(matchArray, compileNode(node.nodes), false);
          break;
        case 'object':
          matcher = curry(matchObject, compileNode(node.nodes), false);
          break;     
        case 'property':
          matcher = curry(hasProperty, 
            [compileNode(node.nodes), node.name ], true);
          break;
        case 'numeric':
          matcher = curry(typePredicate, ['number'], true);
          break;
        case 'string':
          matcher = curry(typePredicate, ['string'], true);;
          break;
        case 'boolean':
          matcher = curry(typePredicate, ['boolean'], true);;
          break;
        case 'function':
          matcher = curry(typePredicate, ['function'], true);;
          break;
        case 'equals':
          matcher = curry(equals, [node.nodes[0].type], true);
          break;
        case 'any':
          matcher = any;
          break;        
        case 'rest':
          matcher = rest;
          break;                  
        default:
          throw "Unknown AST entity: " + node.type;
          break;
      }
      
      /**
       * The pattern must be bound to a name: we achieve this by
       * currying the matcher function into the bind function as
       * an argument.
       */
      if (node.binding) {
        matcher = curry(bind, [node.binding, matcher], true);
      }
      
      result.push(matcher);
    }
        
    return result;
  }

  return {
    compile: function () {
      var match_function = compileNode(AST)[0];
      
      /**
       * If the compilation is successful return a function that takes
       * a value to be matched against and (optionaly) a function that
       * is executed in the bindingContext when the pattern matches.
       */
      return function (obj,handler) {
        var result = match_function (obj);
        
        if(result.result && handler) {
          result['handler_value'] = handler.call(bindingContext);
        }
        
        return result;
      }
    }
  }
}
/*--------------------------------------------------------------------*/

missmatch = function (candidate, patterns) {
  for(pattern in patterns) {
    /**
     * TODO: allow precompilation of patterns and store once-compiled
     * matchers in a buffer.
     */
    var AST = makeParser(pattern).parse();
    match = makeCompiler(AST).compile();
    
    /**
      * It's possible to omit a full function declaration and just
      * write 'my_pattern@my_binding': 'return this.my_binding'.
      * 
      * However it's not encouraged.
      */
    if(typeof handler === 'string') {
      handler = Function (handler);
    }
      
    var handler = patterns[pattern];      
    var result = match(candidate, handler);
    if(result.result)
      return result.handler_value;
  }
}

/**
 * For use with CommonJS 'require'
 */
if(this.exports) {
  this.exports.missmatch = missmatch;
}