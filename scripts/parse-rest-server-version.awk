BEGIN {
  if (expected == "") exit 2
}

NR == 1 &&
  $1 == "rest-server" &&
  $2 == "version" &&
  $3 == "rest-server" &&
  $4 ~ /^[0-9]+\.[0-9]+\.[0-9]+$/ {
  if ($4 != expected) exit 1
  parsed = $4
}

END {
  if (NR != 1 || parsed == "") exit 1
  print parsed
}
