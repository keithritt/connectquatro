from django.shortcuts import render, redirect, HttpResponse
from django.contrib.auth.decorators import login_required



from django.contrib.auth import authenticate, login
from django.contrib.auth.mixins import LoginRequiredMixin

from django.views import View
import sys
from pprint import pprint

import json

from . classes.connect4 import Connect4

#from django import forms
from django.forms.widgets import Select


def index(request):
  history = request.GET.get('history')
  connect4 = Connect4(history)
  board = connect4.get_board_html()

  #pprint(board)

  context = {
    'board': board,
  }

  return render(request, 'web/homepage.html', context)




def ajax(request, action):
  if action == 'place_checker':
    col = request.POST.get('col')
    history = request.POST.get('history')

    connect4 = Connect4(history)

    # for now just assume that the red/human always goes first
    print('****************** new turn*******************')
    ret_data = {
      'red' : connect4.drop_checker(col),
      'yellow' : connect4.drop_checker(connect4.pick_col()),
      'history' : connect4.get_history(),
      'response_msg' : connect4.get_response_msg(),
      'winning_seq' : connect4.winning_seq,
    }

    return HttpResponse(json.dumps(ret_data))

