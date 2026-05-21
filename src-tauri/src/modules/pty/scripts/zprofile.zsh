# terax-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _terax_wrapper_zdotdir="${ZDOTDIR:-}"
  _terax_had_wrapper_zdotdir=0
  [ -n "${ZDOTDIR+x}" ] && _terax_had_wrapper_zdotdir=1

  if [ -n "${TERAX_USER_ZDOTDIR+x}" ]; then
    export ZDOTDIR="$TERAX_USER_ZDOTDIR"
  else
    unset ZDOTDIR
  fi

  _terax_user_zdotdir="${ZDOTDIR:-$HOME}"
  [ -f "$_terax_user_zdotdir/.zprofile" ] && source "$_terax_user_zdotdir/.zprofile"

  if [ -n "${ZDOTDIR+x}" ]; then
    export TERAX_USER_ZDOTDIR="$ZDOTDIR"
  else
    unset TERAX_USER_ZDOTDIR
  fi

  if [ "$_terax_had_wrapper_zdotdir" = 1 ]; then
    export ZDOTDIR="$_terax_wrapper_zdotdir"
  else
    unset ZDOTDIR
  fi
  unset _terax_wrapper_zdotdir _terax_had_wrapper_zdotdir _terax_user_zdotdir
}
:
