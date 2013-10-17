

handleDiceCmd = function (msg) {
  var regex = /(?:roll|throw|flip|toss)\s+(a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|)\s*(die|dice|dies|coin|coins|[dDwW]\d+)/;
  var match = msg.match(regex);
  if (!match)
    return;
  var number = 1;

  var numberLookup = {
    one : 1,
    two : 2,
    three : 3,
    four : 4,
    five : 5,
    six : 6,
    seven : 7,
    eight : 8,
    nine : 9,
    ten : 10,
    };

  if (numberLookup[match[1]]) {
    number = numberLookup[match[1]];
  } else if (parseInt(match[1])) {
    number = parseInt(match[1]);
  }

  if (number > 20) {
    return "Sorry, but I will not throw more than 20 dice for you...";
  }

  var sides = 6;
  var lookup = null;

  var match2 = match[2].match(/[dDwW](\d+)/);

  if (match[2] == 'coin' || match[2] == 'coins') {
    sides = 2; 
    lookup = function (n) {return  ["heads", "tails"][n]};
  } else if (match2) {
    sides = parseInt(match2[1]);
  }

  /*
  if (sides == 6) {
    lookup = function (n) {return ["⚀","⚁","⚂","⚃","⚄","⚅"][n]};
  }
  */

  var result = "Alea Iacta Est"+": ";
  var total = 0;
  for (var i = 0; i < number; i++) {
    n = Math.floor(Math.random() * sides);
    if (lookup) {
      result += lookup(n);
    } else {
      result += (n + 1);
      total += n + 1;
    }

    if (i+1 == number) {
      result += ".";
    } else if (i+2 == number) {
      result += " and ";
    } else {
      result += ", ";
    }
  }

  if (number > 1 && total) {
    result += " (∑: "+ total +")";
  }

  return result;
}
