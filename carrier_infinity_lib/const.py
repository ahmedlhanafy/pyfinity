"""Constants for Carrier Infinity ABCD RS-485 protocol."""

# Device addresses
TSTAT = 0x2001
SAM = 0x9201
HEATPUMP = 0x5101

# Opcodes
OP_READ = 0x0B
OP_WRITE = 0x0C
OP_ACK = 0x06

# Table 00400a byte offsets (Zone 1 comfort profile)
HEAT_SETPOINT_BYTE = 25
COOL_SETPOINT_BYTE = 26

# Temperature ranges (°F)
HEAT_MIN = 55
HEAT_MAX = 85
COOL_MIN = 60
COOL_MAX = 90

# Serial
DEFAULT_BAUDRATE = 38400

# Setpoint write parameters
WRITE_ROUNDS = 6
WRITE_INTERVAL = 5  # seconds between rounds
