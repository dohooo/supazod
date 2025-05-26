export default {
  namingConfig: {
    // Customize naming patterns
    tableOperationPattern: '{schema}{table}{operation}',
    enumPattern: '{schema}{name}',
    functionArgsPattern: '{schema}{function}Args',
    functionReturnsPattern: '{schema}{function}Returns',
    
    // Capitalization settings
    capitalizeSchema: true,
    capitalizeNames: true,
    
    // Separator (empty for no separator)
    separator: '',
  }
}; 