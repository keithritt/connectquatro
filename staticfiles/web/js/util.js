ns.ajax_count = 0;

ns.ajax_complete = function(ajax_start_ts)
{

  if(!ns.ajax_complete)
  {
      ns.ajax_count--;
      if(ns.ajax_count === 0)
        ns.mark_ajax_complete();
  }

    if(ns.DEBUG_MODE)
    {
      var ajax_end_ts = new Date().getTime();

      $('#debug_last_ajax_time').html(((ajax_end_ts - ajax_start_ts) / 1000).toFixed(2));
    }
}


var ajax = function(config)
{
  //console.log(arguments.callee.caller.toString());
  var msg = 'deprecated call to ajax() - page view_id: ' + ns.page_view_id + ' - ' +  arguments.callee.caller.toString();
  ns.record_js_error(msg, ns.BASE_URL + ns.REQUEST_URL);

  if(ns.DEBUG_MODE)
    console.log('deprecated call to ajax()');
  else
    ns.ajax(config);
}

ns.ajax = function(config)
{
  if(config.data == undefined)
    config.data = {};

  // attempt to add csrf token
  try{
    config.data.csrfmiddlewaretoken = $('input[name=csrfmiddlewaretoken]').val();
  }
  catch{
    // do nothing
  }

  console.log(config.data);

  //oConfig.data.iParentId = ns.iPageViewId;
  // temp disabling because of keithandjess.com finance.js
  //oConfig.data.parent_id = ns.iPageViewId;


  var ajax_start_ts = new Date().getTime();
  if(ns.ajax_start_ts === undefined)
    ns.ajax_start_ts = ajax_start_ts;




  if(!ns.ajax_complete)
  {
      ns.ajax_count++;
  }



  if(config.complete)
  {

    var tmp = config.complete;
    config.complete = function(){oTmp(); ns.ajax_complete(ajax_start_ts);};


  }
  else
    config.complete = function(){ns.ajax_complete(ajax_start_ts);};



  jQuery.ajax(config);


}

ns.mark_ajax_complete = function()
{
  //console.log('mark_ajax_complete()');
  ns.ajax_complete = true;

  //ns.fJsTime = (ns.fJsEndTs - ns.fJsStartTs) / 1000;
  ns.ajax__time = 0;
    if(ns.ajax_start_ts !== undefined)
    {
        ns.ajax_end_ts = new Date().getTime();
      //console.log(' ns.ajax_start_ts = '+ ns.ajax_start_ts);
      //console.log(' ns.fAjaxEndTs = '+ ns.fAjaxEndTs);

        ns.ajax_time = ((ns.ajax_end_ts - ns.ajax_start_ts) / 1000).toFixed(2) * 1;
      //console.log(' ns.fAjaxTime = '+ ns.fAjaxTime);
    }

    //ns.fPhpTime = 0;
    ns.total_time = (ns.python_time + ns.js+time + ns.ajax_time).toFixed(2) * 1;

    if(ns.DEBUG_MODE)
    {
        $('#debug_js_time').html(ns.js_time);
        $('#debug_ajax_time').html(ns.ajax_time);
        $('#debug_total_time').html(ns.total_time);
    }



    ns.record_page_request();


}

ns.set_js_time = function()
{
  $(document).ready(function()
  {
    ns.js_end_ts = new Date().getTime();
    ns.js_time = ((ns.js_end_ts - ns.js_start_ts) / 1000).toFixed(2) * 1;

    if(ns.ajax_count == 0)
      ns.mark_ajax_complete();
  });
}

ns.record_page_request = function()
{
  try
  {

    jQuery.ajax({ // should this be ns.ajax() ?
      type: 'POST',
      url: ns.BASE_URL + '/util/record_page_request',
      data: {
        page_view_id: ns.page_view_id,
        js_time: ns.js_time,
        python_time: ns.python_time,
        ajax_time: ns.ajax_time,
        total_time: ns.total_time,
        // get rid of hungarian
        page_view_id: ns.page_view_id,
        js_time: ns.js_time,
        python_time: ns.python_time,
        ajax_time: ns.ajax_time,
        total_time: ns.total_time
      }
    });
  }
  catch(err){}

}

ns.iErrorCount = 0;
ns.record_js_error = function(msg, url, line)
{
  console.log('record_js_error()');
  console.log(msg, ulr, line);

  ns.error_count++;
  if(ns.error_count > 100)
    return; // avoid infinite loops

  try
  {
    ns.ajax({
      type: 'POST',
      url: ns.BASE_URL + '/util/record_js_error',
      data: {
        // remove hungarian notation
        url: sUrl, //ns.REQUEST_URL,
        error: msg,
        line: line
      }
    });
  }
  catch(err){}

}