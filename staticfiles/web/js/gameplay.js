ns.current_turn = 'red';
ns.disabled_cols = [];

ns.hover_col = function(col){
  if(ns.disabled_cols.indexOf(col) != -1)
    return;
  $('#board-header-'+col).addClass(ns.current_turn);
}

ns.unhover_col = function(col){
  $('#board-header-'+col).removeClass(ns.current_turn);
}

ns.click_col = function(col){
  if(ns.disabled_cols.indexOf(col) != -1)
    return;
  var data = {
    'col': col,
    'history': $('#history').val()
  };

  ns.ajax({
    type: 'POST',
    url: ns.BASE_URL + '/ajax/place_checker',
    data: data,
    success: function(json){
      console.log(json);
      var ret = JSON.parse(json);
      console.log(ret);

      // todo allow for determining which turn it is - for now assume it is always red then yellow

      ns.drop_checker('red', ret.red)
      setTimeout(function(){
          ns.drop_checker('yellow', ret.yellow);
      }, 1000);

      $('#history').val(ret.history);
      console.log(ret.response_msg);
      $('#response_msg').html(ret.response_msg);

      if(ret.winning_seq){
        var winning_color;
        if(ret.yellow)
          winning_color = 'yellow';
        else
          winning_color = 'red';

        setTimeout(function(){
            ns.highlight_win(winning_color, ret.winning_seq);
        }, 1000);
      }
    }
  });
}

ns.highlight_win = function(color, seq){
  console.log('ns.highlight_win('+color+', '+seq+')');
  var spots = seq.split('-');
  console.log(spots);
  spots.forEach(function(spot){
    console.log(spot);
    $('#board-spot-'+spot).addClass(color+'-highlight');
  });
}

ns.drop_checker = function(color, spot){
  //console.log('drop_checker('+color+', '+spot+')');
  if(spot == null)
    return;

  // clear all highlights
  $('td.'+color+'-highlight').removeClass(color+'-highlight');


  var col = spot[0];
  var row = spot[1];
  //console.log(col);
  //console.log(row);
  var rowIdx = 7;
  while(rowIdx >= row){

    var delay = (8 - rowIdx) * 100;

    ns.add_spot_color(color, col, rowIdx, delay-50);
    if(rowIdx != row)
      ns.remove_spot_color(color, col, rowIdx, delay);
    rowIdx--;
  }

  setTimeout(function(){
      $('#board-spot-'+spot).addClass(color+'-highlight');
      //$('#board-spot-'+spot).removeClass(color);
  }, 1000);

  // dont allow users to select the filled columns
  if(row == 6)
    ns.disable_col(col);
}

ns.disable_col = function(col){
  //console.log('ns.disable_col('+col+')');
  //console.log($('td[col="'+col+'"]'));
  //$('td[col="'+col+'"]').unbind('mouseenter mouseleave click');
  $('td[col="'+col+'"]').removeClass('clickable');
  $('td[col="'+col+'"]').addClass('unclickable');
  ns.disabled_cols.push(col);

}

ns.add_spot_color = function(color, col, row, delay){
  setTimeout(function(){
      $('#board-spot-'+col+row).addClass(color);
  }, delay);
}

ns.remove_spot_color = function(color, col, row, delay){
  //console.log('ns.remove_spot_color('+row+')');

  setTimeout(function(){
      $('#board-spot-'+col+row).removeClass(color);
  }, delay);

}
