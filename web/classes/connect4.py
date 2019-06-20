
from pprint import pprint
import random
from .util import Util
'''
http://web.mit.edu/sp.268/www/2010/connectFourSlides.pdf
'''


class Connect4():


  def __init__(self, history):
    print('Connect4.__init__({})'.format(history))

    self.history = []
    self.set_history(history)

    self.skill_level = 1;

    self.rows = range(1, 7)
    self.current_turn = 'red'
    self.grid = {}
    self.seqs = {}
    self.winning_seq = None
    self.game_over = False
    self.game_status = 'active'
    self.cols = {}
    self.last_spot = None
    self.init_col_data()
    #self.spot_seq_map = {}

    self.parse_history()
    #print('history = ')
    #pprint(self.history)
    #print('grid = ')
    #pprint(self.grid)
    self.set_all_seqs()

  def init_col_data(self):
    #print('Connect4.init_col_data()')
    cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for idx in range(7):
      #print(idx)
      col = cols[idx]
      #print(col)
      self.cols[col] = {'height': 0, 'status': 'available'}

  def set_all_seqs(self):
    #print('set_all_seqs()')
    self.set_all_south_seqs()
    #self.set_all_southeast_seqs()

    #pprint(self.seqs)

  def set_all_south_seqs(self):
    print('Connect4.set_all_south_seqs()')
    for col_idx in self.cols:
      print(col_idx)
      for row_idx in range(6, 3, -1):
        spot1 = '{}{}'.format(col_idx, row_idx)
        spot2 = self.get_adjacent_spot(spot1, 'south')
        spot3 = self.get_adjacent_spot(spot2, 'south')
        spot4 = self.get_adjacent_spot(spot3, 'south')

        name = '{}-{}-{}-{}'.format(spot1, spot2, spot3, spot4)

        self.seqs[name] = {
          'name': name,
          'dir': 'south',
          'spots': [spot1, spot2, spot3, spot4]
        }


  def get_adjacent_spot(self, spot, direction):
    col = spot[0]
    row = int(spot[1])

    if direction == 'south':
      if col == 1:
        next_spot = None
      else:
        next_spot = '{}{}'.format(col, row-1)

    return next_spot


  def toggle_turn(self):
    print('Connect4.toggle_turn()')
    if(self.current_turn == 'red'):
      self.current_turn = 'yellow'
    else:
      self.current_turn = 'red'

    #self.currency = Currency.objects.get(symbol=symbol)

  def set_history(self, history):
    print('set_history()')
    pprint(history)

    if history is None:
      self.history = []
      return

    if history == '':
      tmp = []
      self.first_move = 'R' #todo - allow for yellow to start game
    else:
      tmp = history.split('-')
      self.first_move = tmp[0]
      del(tmp[0])

    self.history = tmp

  def parse_history(self):
    #print('parse_history()')
    for spot in self.history:
      #print(spot)
      #print(self.current_turn)
      col = spot[0]
      self.increment_col_height(col)
      self.grid[spot] = self.current_turn
      self.toggle_turn()

    if len(self.history):
      self.last_spot = self.history[-1]

  def increment_col_height(self, col):
    self.cols[col]['height'] +=1
    if(self.cols[col]['height'] == 6):
      self.cols[col]['status'] = 'unavailable'




  #return the spot where the checker is dropped
  def drop_checker(self, col):
    if col is None:
      return
    print('Connect4.drop_checker('+col+')')
    self.increment_col_height(col)
    spot = '{}{}'.format(col, self.cols[col]['height'])
    self.last_spot = spot;
    self.append_history(spot)
    self.grid[spot] = self.current_turn
    self.set_winning_seq()
    self.check_for_tie()
    if not self.game_over:
      self.toggle_turn()

    return spot

  def check_for_tie(self):
    for col, data in self.cols.items():
      print(col)
      pprint(data)
      if data['height'] < 7:
        return

    # if your still here - all cols are 7 tall - game ends in a tie
    self.game_over = True
    self.game_status = 'tie'

  def set_winning_seq(self):

    print('Connect4.check_for_win()')
    #print('current_turn = {}'.format(self.current_turn))
    #print('last spot = {}'.format(self.last_spot))
    possible_wins = []
    for seq, seq_data in self.seqs.items():
      #pprint(seq)

      #pprint(seq_data)
      if self.last_spot in seq_data['spots']:
        possible_wins.append(seq)

    #print('possible wins = ')
    #pprint(possible_wins)

    for possible_win in possible_wins:
      #game_over = False
      #print(possible_win)
      spots = self.seqs[possible_win]['spots']
      #print('spots = ')
      #pprint(spots)
      seq_count = 0
      for spot in spots:
        #print(spot)
        #print('grid entry =')
        if spot in self.grid:
          #print(self.grid[spot])
          #print(self.current_turn)
          if(self.grid[spot] == self.current_turn):
            #print('this spot mismatches the current turn')
            seq_count+=1
          else:
            break
        else:
          break

        if seq_count == 4 :
          self.game_over = True
          self.winning_seq = possible_win
          return



  def pick_col(self):
    print('Connect4.pick_col()')

    if self.game_over:
      return None

    if self.skill_level == 1:
      col = self.get_random_col()


    return col

  def get_random_col(self):
    print('Connect4.pick_random_col()')

    available_cols = []
    for col, data in self.cols.items():
      print(col)
      print(data)
      if data['status'] == 'available':
        available_cols.append(col)

    pprint(available_cols)


    return random.choice(available_cols)




  def append_history(self, data):
    #print('append_history({})'.format(data))
    self.history.append(data)

    #print('self.history = ')
    #pprint(self.history)


  def get_history(self):
    if len(self.history) == 0:
      return ''
    #print('Connect4.get_history()')
    #pprint(self.history)
    tmp = self.history
    tmp.insert(0, self.first_move)
    ret = '-'.join(tmp)
    #pprint(ret)
    return ret

  def get_response_msg(self):

    if self.game_over:
      if(self.game_status == 'tie'):
        msg = 'Tie game.'
      else:
        msg = '{} wins!'.format(Util.uc_first(self.current_turn))
    else:
      #super hacky - toggle turn twice to get other color
      self.toggle_turn()
      msg = 'Last Move: {} to {}'.format(Util.uc_first(self.current_turn), self.last_spot)
      self.toggle_turn()

    return msg


  #@staticmethod
  def get_board_html(self):
    letter_map={1:'a', 2:'b', 3:'c', 4:'d', 5:'e', 6:'f', 7:'g'}


    html = '<table id="connect4-board">'
    #for row in reversed(range(1,8)):
    for row in range(7,0, -1):

      #if row == 8: #header row
      html+= '<tr id="board-row-{row}" class="row" row="{row}">'.format(row=row)
      #else:
      #  html+= '<tr id="board-row-{}" class="row" row="{}">'.format(row, row)

      #td_class = 'spot' if row != 7 else ''

      for col in range(1,8):
        col_name = letter_map[col]

        if row == 7:
          html+= '<td id="board-header-{col_name}" class="clickable"></td>'.format(col_name=col_name)
        else:
          attrs = self.get_spot_attr_html('{}{}'.format(col_name,row))
          html+= '<td id="board-spot-{col_name}{row}" row="{row}" col="{col_name}" {attrs}>{col_name}{row}</td>'.format(
            col_name=col_name, row=row, attrs=attrs)

      html+= '</tr>'
    html+='</table>'


    html+= '<input id="history" type="hidden" value="{}"/>'.format(self.get_history());
    html+= '<input id="config" type="hidden"/>';
    html+= '<div id="response_msg">{}</div>'.format(self.get_response_msg());

    return html

  def get_spot_attr_html(self, spot):
    #print('Connect4.get_spot_attr_html('+spot+')')
    #class="clickable" onclick="ns.click_col(\'{col_name}\');" onmouseover="ns.hover_col(\'{col_name}\');" onmouseout="ns.unhover_col(\'{col_name}\');"
    col = spot[0]
    row = spot[1]
    classes = ['spot']
    attrs = {}

    #pprint(self.history)
    last_moves = self.history[-2:]

    if spot in self.grid:
      classes.append(self.grid[spot])
      if spot in last_moves:
        classes.append(self.grid[spot]+'-highlight')



    if self.cols[col]['height'] == 6:
      classes.append('unclickable')
    else:
      classes.append('clickable')
      attrs['onclick'] = "ns.click_col('{}');".format(col)
      attrs['onmouseover'] = "ns.hover_col('{}');".format(col)
      attrs['onmouseout'] = "ns.unhover_col('{}');".format(col)

    attrs['class'] = ' '.join(classes)


    #pprint(classes)
    #pprint(attrs)

    listener_html = ''
    for name, value in attrs.items():
      listener_html+= ' {}="{}"'.format(name, value)

    #print(listener_html)


    #pprint(self.grid)

    return listener_html





